import type { Color, Piece, PieceType } from './types';

export const FILES = 'abcdefgh';

export const PIECE_VALUES: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

export const square = (file: number, rank: number): number => rank * 8 + file;
export const fileOf = (sq: number): number => sq & 7;
export const rankOf = (sq: number): number => sq >> 3;
export const opposite = (c: Color): Color => (c === 'w' ? 'b' : 'w');

export function squareName(sq: number): string {
  return FILES[fileOf(sq)] + String(rankOf(sq) + 1);
}

export function parseSquare(name: string): number {
  if (!/^[a-h][1-8]$/.test(name)) throw new Error(`Invalid square: ${name}`);
  return square(FILES.indexOf(name[0]), Number(name[1]) - 1);
}

/** Square reached from `sq` by (df, dr), or -1 when off the board. */
export function offset(sq: number, df: number, dr: number): number {
  const f = fileOf(sq) + df;
  const r = rankOf(sq) + dr;
  return f < 0 || f > 7 || r < 0 || r > 7 ? -1 : square(f, r);
}

/** true when the square is a light square (h1 is light). */
export const isLightSquare = (sq: number): boolean => (fileOf(sq) + rankOf(sq)) % 2 === 1;

const PIECE_CACHE = new Map<string, Piece>();
/** Shared immutable piece instances. */
export function piece(type: PieceType, color: Color): Piece {
  const key = color + type;
  let p = PIECE_CACHE.get(key);
  if (!p) {
    p = Object.freeze({ type, color });
    PIECE_CACHE.set(key, p);
  }
  return p;
}

export function pieceToChar(p: Piece): string {
  return p.color === 'w' ? p.type.toUpperCase() : p.type;
}

export function charToPiece(ch: string): Piece | null {
  const lower = ch.toLowerCase();
  if (!'pnbrqk'.includes(lower) || lower.length !== 1) return null;
  return piece(lower as PieceType, ch === lower ? 'b' : 'w');
}
