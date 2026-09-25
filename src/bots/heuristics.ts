import { PIECE_VALUES, fileOf, offset, opposite, rankOf } from '../engine/board';
import { findKing, inCheck } from '../engine/movegen';
import type { Color, PieceType } from '../engine/types';
import { EvalContext, sign } from './context';

/**
 * A "calcul" (reasoning type) a bot can be given.
 * `evaluate` returns a score in centipawns from WHITE's point of view.
 */
export interface Heuristic {
  id: string;
  name: string;
  icon: string;
  description: string;
  evaluate(ctx: EvalContext): number;
}

const COLORS: readonly Color[] = ['w', 'b'];

// Piece-square tables (white's view, a8..h8 first) — Simplified Evaluation Function.
// prettier-ignore
const PST: Record<Exclude<PieceType, 'k'> | 'k_mid' | 'k_end', number[]> = {
  p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5,
      0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
  n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30,
      -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30,
      -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
  b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10,
      -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10,
      -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
  r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
      -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
  q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10,
      -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10,
      -20,-10,-10,-5,-5,-10,-10,-20],
  k_mid: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
      -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10,
      20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
  k_end: [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30,
      -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30,
      -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30,
      -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50],
};

const pstIndex = (sq: number, color: Color): number =>
  color === 'w' ? (7 - rankOf(sq)) * 8 + fileOf(sq) : rankOf(sq) * 8 + fileOf(sq);

/** Chebyshev distance from the four central squares (0 = central, 3 = edge). */
const centerDistance = (sq: number): number =>
  Math.max(Math.abs(fileOf(sq) - 3.5), Math.abs(rankOf(sq) - 3.5)) - 0.5;

const kingDistance = (a: number, b: number): number =>
  Math.max(Math.abs(fileOf(a) - fileOf(b)), Math.abs(rankOf(a) - rankOf(b)));

export const material: Heuristic = {
  id: 'material',
  name: 'Matériel',
  icon: '⚖️',
  description: 'Compte la valeur des pièces : pion 1, cavalier 3.2, fou 3.3, tour 5, dame 9.',
  evaluate: (ctx) => ctx.material(),
};

export const positional: Heuristic = {
  id: 'positional',
  name: 'Placement',
  icon: '🧭',
  description: 'Tables de placement : chaque pièce a ses cases idéales (cavaliers au centre…).',
  evaluate(ctx) {
    const phase = ctx.phase();
    let score = 0;
    ctx.pos.board.forEach((p, sq) => {
      if (!p) return;
      const i = pstIndex(sq, p.color);
      const v = p.type === 'k' ? PST.k_mid[i] * phase + PST.k_end[i] * (1 - phase) : PST[p.type][i];
      score += sign(p.color) * v;
    });
    return score;
  },
};

export const mobility: Heuristic = {
  id: 'mobility',
  name: 'Mobilité',
  icon: '🏃',
  description: 'Préfère les positions où ses pièces ont beaucoup de coups disponibles.',
  evaluate: (ctx) => 4 * (ctx.moves('w').length - ctx.moves('b').length),
};

export const safety: Heuristic = {
  id: 'safety',
  name: 'Sécurité des pièces',
  icon: '🛡️',
  description:
    'Analyse les pièces importantes : sont-elles attaquées ? défendues ? Évite de laisser des pièces en prise.',
  evaluate(ctx) {
    const { board, turn } = ctx.pos;
    let score = 0;
    board.forEach((p, sq) => {
      if (!p || p.type === 'k') return;
      const enemy = ctx.attacks(opposite(p.color));
      if (!enemy.count[sq]) return;
      const value = PIECE_VALUES[p.type];
      const defended = ctx.attacks(p.color).count[sq] > 0;
      const threat = !defended ? value : Math.max(0, value - enemy.cheapest[sq]);
      // The side to move can still react, so its threatened pieces are less at risk.
      score -= sign(p.color) * threat * (p.color === turn ? 0.15 : 0.6);
    });
    return score;
  },
};

const CENTER = [27, 28, 35, 36];
const EXTENDED_CENTER = [18, 19, 20, 21, 26, 29, 34, 37, 42, 43, 44, 45];

export const center: Heuristic = {
  id: 'center',
  name: 'Contrôle du centre',
  icon: '🎯',
  description: 'Occupe et attaque les cases centrales d4, e4, d5, e5.',
  evaluate(ctx) {
    const { board } = ctx.pos;
    let score = 0;
    for (const c of COLORS) {
      let s = 0;
      for (const sq of CENTER) {
        const p = board[sq];
        if (p?.color === c) s += p.type === 'p' ? 25 : 12;
        s += 8 * ctx.attacks(c).count[sq];
      }
      for (const sq of EXTENDED_CENTER) s += 3 * ctx.attacks(c).count[sq];
      score += sign(c) * s;
    }
    return score;
  },
};

export const kingSafety: Heuristic = {
  id: 'kingSafety',
  name: 'Sécurité du roi',
  icon: '👑',
  description: 'Garde un bouclier de pions devant son roi et compte les attaquants autour de lui.',
  evaluate(ctx) {
    const { board } = ctx.pos;
    const weight = 0.3 + 0.7 * ctx.phase();
    let score = 0;
    for (const c of COLORS) {
      const k = findKing(board, c);
      const dir = c === 'w' ? 1 : -1;
      let s = 0;
      for (const df of [-1, 0, 1]) {
        for (const dr of [dir, 2 * dir]) {
          const sq = offset(k, df, dr);
          const p = sq >= 0 ? board[sq] : null;
          if (p?.type === 'p' && p.color === c) s += dr === dir ? 12 : 6;
        }
      }
      const ownPawnOnFile = board.some(
        (p, sq) => p?.type === 'p' && p.color === c && fileOf(sq) === fileOf(k),
      );
      if (!ownPawnOnFile) s -= 20;
      for (const [df, dr] of [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [-1, 1],
        [-1, 0],
        [-1, -1],
        [0, -1],
        [1, -1],
      ]) {
        const sq = offset(k, df, dr);
        if (sq >= 0) s -= 10 * ctx.attacks(opposite(c)).count[sq];
      }
      score += sign(c) * s;
    }
    return score * weight;
  },
};

export const pawnStructure: Heuristic = {
  id: 'pawnStructure',
  name: 'Structure de pions',
  icon: '⛓️',
  description: 'Pénalise pions doublés et isolés, récompense les pions passés.',
  evaluate(ctx) {
    const { board } = ctx.pos;
    const files: Record<Color, number[]> = { w: new Array(8).fill(0), b: new Array(8).fill(0) };
    const pawns: { sq: number; color: Color }[] = [];
    board.forEach((p, sq) => {
      if (p?.type !== 'p') return;
      files[p.color][fileOf(sq)]++;
      pawns.push({ sq, color: p.color });
    });
    let score = 0;
    for (const c of COLORS) {
      for (const n of files[c]) if (n > 1) score -= sign(c) * 18 * (n - 1);
    }
    for (const { sq, color } of pawns) {
      const f = fileOf(sq);
      const own = files[color];
      if (!(own[f - 1] > 0) && !(own[f + 1] > 0)) score -= sign(color) * 14;
      const enemy = opposite(color);
      const blocked = pawns.some(
        (o) =>
          o.color === enemy &&
          Math.abs(fileOf(o.sq) - f) <= 1 &&
          (color === 'w' ? rankOf(o.sq) > rankOf(sq) : rankOf(o.sq) < rankOf(sq)),
      );
      if (!blocked) {
        const advance = color === 'w' ? rankOf(sq) - 1 : 6 - rankOf(sq);
        score += sign(color) * (10 + advance * advance * 6);
      }
    }
    return score;
  },
};

const MINOR_HOMES: Record<Color, number[]> = { w: [1, 2, 5, 6], b: [57, 58, 61, 62] };

export const development: Heuristic = {
  id: 'development',
  name: 'Développement',
  icon: '🚀',
  description: 'Sort ses pièces mineures, roque tôt et évite de sortir la dame trop vite.',
  evaluate(ctx) {
    const phase = ctx.phase();
    const { board } = ctx.pos;
    let score = 0;
    for (const c of COLORS) {
      let s = 0;
      const undeveloped = MINOR_HOMES[c].filter((sq) => {
        const p = board[sq];
        return p?.color === c && (p.type === 'n' || p.type === 'b');
      }).length;
      s -= 18 * undeveloped;
      const k = findKing(board, c);
      const backRank = c === 'w' ? 0 : 7;
      if (rankOf(k) === backRank && (fileOf(k) >= 6 || fileOf(k) <= 2)) s += 35;
      else if (fileOf(k) !== 4 || rankOf(k) !== backRank) s -= 25;
      const queenHome = c === 'w' ? 3 : 59;
      const queenOut = board.some((p, sq) => p?.type === 'q' && p.color === c && sq !== queenHome);
      if (queenOut && undeveloped >= 2) s -= 20;
      score += sign(c) * s;
    }
    return score * phase;
  },
};

export const aggression: Heuristic = {
  id: 'aggression',
  name: 'Agressivité',
  icon: '⚔️',
  description: 'Cherche à attaquer les pièces adverses et à mettre le roi en échec.',
  evaluate(ctx) {
    let score = 0;
    for (const c of COLORS) {
      let s = 0;
      for (const m of ctx.moves(c)) {
        if (m.captured && m.captured !== 'k') s += PIECE_VALUES[m.captured] / 25;
      }
      if (inCheck(ctx.pos, opposite(c))) s += 40;
      score += sign(c) * s;
    }
    return score;
  },
};

export const endgame: Heuristic = {
  id: 'endgame',
  name: 'Finale',
  icon: '🏁',
  description:
    "En fin de partie : active son roi et, avec l'avantage, repousse le roi adverse au bord pour mater.",
  evaluate(ctx) {
    const weight = 1 - ctx.phase();
    const { board } = ctx.pos;
    const wk = findKing(board, 'w');
    const bk = findKing(board, 'b');
    let score = (centerDistance(bk) - centerDistance(wk)) * 10;
    const balance = ctx.material();
    if (Math.abs(balance) > 200) {
      const winner: Color = balance > 0 ? 'w' : 'b';
      const loserKing = winner === 'w' ? bk : wk;
      score += sign(winner) * (centerDistance(loserKing) * 20 + (7 - kingDistance(wk, bk)) * 8);
    }
    return score * weight;
  },
};

export const HEURISTICS: Heuristic[] = [
  material,
  positional,
  mobility,
  safety,
  center,
  kingSafety,
  pawnStructure,
  development,
  aggression,
  endgame,
];

const registry = new Map(HEURISTICS.map((h) => [h.id, h]));

export function getHeuristic(id: string): Heuristic | undefined {
  return registry.get(id);
}

/** Adds a new reasoning type at runtime (plugins, experiments…). */
export function registerHeuristic(h: Heuristic): void {
  if (registry.has(h.id)) throw new Error(`Heuristic "${h.id}" already registered`);
  registry.set(h.id, h);
  HEURISTICS.push(h);
}
