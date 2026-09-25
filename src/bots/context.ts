import { PIECE_VALUES, offset } from '../engine/board';
import { BISHOP_DIRS, KING_DIRS, KNIGHT_DIRS, ROOK_DIRS, pseudoMoves } from '../engine/movegen';
import type { Color, Move, Position } from '../engine/types';

export interface AttackMap {
  /** Number of pieces of the color attacking each square. */
  count: Uint8Array;
  /** Value of the cheapest attacker of each square (king = 10000, none = Infinity). */
  cheapest: number[];
}

const KING_VALUE = 10_000;

const MAX_PHASE_MATERIAL = 2 * (2 * 320 + 2 * 330 + 2 * 500 + 900);

/** Shared, lazily-computed data handed to every heuristic for one position. */
export class EvalContext {
  private readonly movesCache: Partial<Record<Color, Move[]>> = {};
  private readonly attackCache: Partial<Record<Color, AttackMap>> = {};
  private phaseCache: number | null = null;

  constructor(readonly pos: Position) {}

  /** Pseudo-legal moves of a color, regardless of whose turn it is. */
  moves(color: Color): Move[] {
    return (this.movesCache[color] ??= pseudoMoves(this.pos, color));
  }

  /** Squares attacked (or defended) by every piece of a color, computed in one pass. */
  attacks(color: Color): AttackMap {
    const cached = this.attackCache[color];
    if (cached) return cached;
    const map: AttackMap = { count: new Uint8Array(64), cheapest: new Array(64).fill(Infinity) };
    const { board } = this.pos;
    const hit = (sq: number, value: number): void => {
      map.count[sq]++;
      if (value < map.cheapest[sq]) map.cheapest[sq] = value;
    };
    board.forEach((p, from) => {
      if (!p || p.color !== color) return;
      const value = p.type === 'k' ? KING_VALUE : PIECE_VALUES[p.type];
      const steps = (dirs: readonly (readonly [number, number])[], slide: boolean): void => {
        for (const [df, dr] of dirs) {
          let sq = offset(from, df, dr);
          while (sq >= 0) {
            hit(sq, value);
            if (!slide || board[sq]) break;
            sq = offset(sq, df, dr);
          }
        }
      };
      const pawnDr = color === 'w' ? 1 : -1;
      const patterns: Record<string, [readonly (readonly [number, number])[], boolean]> = {
        p: [
          [
            [-1, pawnDr],
            [1, pawnDr],
          ],
          false,
        ],
        n: [KNIGHT_DIRS, false],
        k: [KING_DIRS, false],
        b: [BISHOP_DIRS, true],
        r: [ROOK_DIRS, true],
        q: [KING_DIRS, true],
      };
      steps(...patterns[p.type]);
    });
    return (this.attackCache[color] = map);
  }

  /** 1 = opening (all pieces on board), 0 = bare endgame. Based on non-pawn material. */
  phase(): number {
    if (this.phaseCache === null) {
      let material = 0;
      for (const p of this.pos.board) {
        if (p && p.type !== 'p' && p.type !== 'k') material += PIECE_VALUES[p.type];
      }
      this.phaseCache = Math.min(1, material / MAX_PHASE_MATERIAL);
    }
    return this.phaseCache;
  }

  /** Material balance from white's point of view. */
  material(): number {
    let score = 0;
    for (const p of this.pos.board) {
      if (p) score += (p.color === 'w' ? 1 : -1) * PIECE_VALUES[p.type];
    }
    return score;
  }
}

export const sign = (c: Color): number => (c === 'w' ? 1 : -1);
