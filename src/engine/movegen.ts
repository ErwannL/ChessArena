import { PIECE_VALUES, fileOf, offset, opposite, piece, rankOf, squareName } from './board';
import type { Board, Castling, Color, Move, PieceType, Position } from './types';

type Dir = readonly [number, number];
export const KNIGHT_DIRS: readonly Dir[] = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];
export const KING_DIRS: readonly Dir[] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];
export const ROOK_DIRS: readonly Dir[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
export const BISHOP_DIRS: readonly Dir[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const PROMOTIONS: readonly PieceType[] = ['q', 'r', 'b', 'n'];

/** Squares of the pieces of color `by` attacking `sq`. */
export function attackersOf(board: Board, sq: number, by: Color, firstOnly = false): number[] {
  const found: number[] = [];
  const check = (s: number, types: string): boolean => {
    const p = board[s];
    if (p && p.color === by && types.includes(p.type)) {
      found.push(s);
      return firstOnly;
    }
    return false;
  };
  const pawnRank = by === 'w' ? -1 : 1;
  for (const df of [-1, 1]) {
    const s = offset(sq, df, pawnRank);
    if (s >= 0 && check(s, 'p')) return found;
  }
  for (const [df, dr] of KNIGHT_DIRS) {
    const s = offset(sq, df, dr);
    if (s >= 0 && check(s, 'n')) return found;
  }
  for (const [df, dr] of KING_DIRS) {
    const s = offset(sq, df, dr);
    if (s >= 0 && check(s, 'k')) return found;
  }
  const slide = (dirs: readonly Dir[], types: string): boolean => {
    for (const [df, dr] of dirs) {
      let s = offset(sq, df, dr);
      while (s >= 0) {
        if (board[s]) {
          if (check(s, types)) return true;
          break;
        }
        s = offset(s, df, dr);
      }
    }
    return false;
  };
  if (slide(ROOK_DIRS, 'rq')) return found;
  slide(BISHOP_DIRS, 'bq');
  return found;
}

export function isSquareAttacked(board: Board, sq: number, by: Color): boolean {
  return attackersOf(board, sq, by, true).length > 0;
}

export function findKing(board: Board, color: Color): number {
  return board.findIndex((p) => p?.type === 'k' && p.color === color);
}

export function inCheck(pos: Position, color: Color = pos.turn): boolean {
  const k = findKing(pos.board, color);
  return k >= 0 && isSquareAttacked(pos.board, k, opposite(color));
}

function pushPawnMove(moves: Move[], base: Move, promoRank: number): void {
  if (rankOf(base.to) === promoRank) {
    for (const promotion of PROMOTIONS) moves.push({ ...base, promotion });
  } else {
    moves.push(base);
  }
}

function pawnMoves(pos: Position, from: number, color: Color, moves: Move[]): void {
  const { board } = pos;
  const dir = color === 'w' ? 1 : -1;
  const startRank = color === 'w' ? 1 : 6;
  const promoRank = color === 'w' ? 7 : 0;
  const one = offset(from, 0, dir);
  if (one >= 0 && !board[one]) {
    pushPawnMove(moves, { from, to: one, piece: 'p', color }, promoRank);
    const two = offset(from, 0, 2 * dir);
    if (rankOf(from) === startRank && !board[two]) {
      moves.push({ from, to: two, piece: 'p', color, double: true });
    }
  }
  for (const df of [-1, 1]) {
    const to = offset(from, df, dir);
    if (to < 0) continue;
    const target = board[to];
    if (target && target.color !== color) {
      pushPawnMove(moves, { from, to, piece: 'p', color, captured: target.type }, promoRank);
    } else if (!target && to === pos.ep) {
      moves.push({ from, to, piece: 'p', color, captured: 'p', enPassant: true });
    }
  }
}

function stepMoves(
  board: Board,
  from: number,
  color: Color,
  type: PieceType,
  dirs: readonly Dir[],
  slide: boolean,
  moves: Move[],
): void {
  for (const [df, dr] of dirs) {
    let to = offset(from, df, dr);
    while (to >= 0) {
      const target = board[to];
      if (target) {
        if (target.color !== color)
          moves.push({ from, to, piece: type, color, captured: target.type });
        break;
      }
      moves.push({ from, to, piece: type, color });
      if (!slide) break;
      to = offset(to, df, dr);
    }
  }
}

function castleMoves(pos: Position, from: number, color: Color, moves: Move[]): void {
  const home = color === 'w' ? 4 : 60;
  if (from !== home) return;
  const enemy = opposite(color);
  const { board, castling } = pos;
  const rook = piece('r', color);
  const kingSide = color === 'w' ? castling.wk : castling.bk;
  const queenSide = color === 'w' ? castling.wq : castling.bq;
  if (!kingSide && !queenSide) return;
  if (isSquareAttacked(board, home, enemy)) return;
  if (
    kingSide &&
    board[home + 3] === rook &&
    !board[home + 1] &&
    !board[home + 2] &&
    !isSquareAttacked(board, home + 1, enemy) &&
    !isSquareAttacked(board, home + 2, enemy)
  ) {
    moves.push({ from, to: home + 2, piece: 'k', color, castle: 'k' });
  }
  if (
    queenSide &&
    board[home - 4] === rook &&
    !board[home - 1] &&
    !board[home - 2] &&
    !board[home - 3] &&
    !isSquareAttacked(board, home - 1, enemy) &&
    !isSquareAttacked(board, home - 2, enemy)
  ) {
    moves.push({ from, to: home - 2, piece: 'k', color, castle: 'q' });
  }
}

/** Pseudo-legal moves (may leave own king in check) for `color` (defaults to side to move). */
export function pseudoMoves(pos: Position, color: Color = pos.turn): Move[] {
  const moves: Move[] = [];
  const { board } = pos;
  for (let from = 0; from < 64; from++) {
    const p = board[from];
    if (!p || p.color !== color) continue;
    switch (p.type) {
      case 'p':
        pawnMoves(pos, from, color, moves);
        break;
      case 'n':
        stepMoves(board, from, color, 'n', KNIGHT_DIRS, false, moves);
        break;
      case 'b':
        stepMoves(board, from, color, 'b', BISHOP_DIRS, true, moves);
        break;
      case 'r':
        stepMoves(board, from, color, 'r', ROOK_DIRS, true, moves);
        break;
      case 'q':
        stepMoves(board, from, color, 'q', KING_DIRS, true, moves);
        break;
      case 'k':
        stepMoves(board, from, color, 'k', KING_DIRS, false, moves);
        castleMoves(pos, from, color, moves);
        break;
    }
  }
  return moves;
}

const CORNER_RIGHTS: Record<number, keyof Castling> = { 0: 'wq', 7: 'wk', 56: 'bq', 63: 'bk' };

/** Returns the position after playing `m` (assumed pseudo-legal). Does not mutate `pos`. */
export function applyMove(pos: Position, m: Move): Position {
  const board = pos.board.slice();
  const moving = board[m.from]!;
  board[m.from] = null;
  if (m.enPassant) board[m.to + (m.color === 'w' ? -8 : 8)] = null;
  board[m.to] = m.promotion ? piece(m.promotion, m.color) : moving;
  if (m.castle) {
    const base = rankOf(m.from) * 8;
    const [rookFrom, rookTo] = m.castle === 'k' ? [base + 7, base + 5] : [base, base + 3];
    board[rookTo] = board[rookFrom];
    board[rookFrom] = null;
  }
  const castling = { ...pos.castling };
  if (m.piece === 'k') {
    if (m.color === 'w') castling.wk = castling.wq = false;
    else castling.bk = castling.bq = false;
  }
  for (const s of [m.from, m.to]) {
    const right = CORNER_RIGHTS[s];
    if (right) castling[right] = false;
  }
  return {
    board,
    turn: opposite(pos.turn),
    castling,
    ep: m.double ? (m.from + m.to) / 2 : null,
    halfmove: m.piece === 'p' || m.captured ? 0 : pos.halfmove + 1,
    fullmove: pos.fullmove + (pos.turn === 'b' ? 1 : 0),
  };
}

export function legalMoves(pos: Position): Move[] {
  return pseudoMoves(pos).filter((m) => !inCheck(applyMove(pos, m), pos.turn));
}

/** Null move: passes the turn (used by evaluation helpers). */
export function withTurn(pos: Position, turn: Color): Position {
  return pos.turn === turn ? pos : { ...pos, turn, ep: null };
}

export function isInsufficientMaterial(board: Board): boolean {
  const minors: { type: PieceType; light: boolean }[] = [];
  for (let s = 0; s < 64; s++) {
    const p = board[s];
    if (!p || p.type === 'k') continue;
    if (p.type === 'p' || p.type === 'r' || p.type === 'q') return false;
    minors.push({ type: p.type, light: (fileOf(s) + rankOf(s)) % 2 === 1 });
  }
  if (minors.length <= 1) return true;
  return minors.every((m) => m.type === 'b' && m.light === minors[0].light);
}

/** Most-valuable-victim / least-valuable-attacker ordering score. */
export function moveOrderScore(m: Move): number {
  let score = 0;
  if (m.captured) score += 10 * PIECE_VALUES[m.captured] - PIECE_VALUES[m.piece] + 10_000;
  if (m.promotion) score += PIECE_VALUES[m.promotion] + 5_000;
  return score;
}

export function moveToUci(m: Move): string {
  return squareName(m.from) + squareName(m.to) + (m.promotion ?? '');
}
