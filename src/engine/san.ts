import { FILES, fileOf, parseSquare, rankOf, squareName } from './board';
import { applyMove, inCheck, legalMoves } from './movegen';
import type { Move, PieceType, Position } from './types';

export function toSan(pos: Position, move: Move, legal: Move[] = legalMoves(pos)): string {
  let san: string;
  if (move.castle) {
    san = move.castle === 'k' ? 'O-O' : 'O-O-O';
  } else {
    let disambiguation = '';
    if (move.piece === 'p') {
      if (move.captured) disambiguation = FILES[fileOf(move.from)];
    } else {
      const rivals = legal.filter(
        (o) => o.piece === move.piece && o.to === move.to && o.from !== move.from,
      );
      if (rivals.length) {
        const sameFile = rivals.some((o) => fileOf(o.from) === fileOf(move.from));
        const sameRank = rivals.some((o) => rankOf(o.from) === rankOf(move.from));
        if (!sameFile) disambiguation = FILES[fileOf(move.from)];
        else if (!sameRank) disambiguation = String(rankOf(move.from) + 1);
        else disambiguation = squareName(move.from);
      }
    }
    san =
      (move.piece === 'p' ? '' : move.piece.toUpperCase()) +
      disambiguation +
      (move.captured ? 'x' : '') +
      squareName(move.to) +
      (move.promotion ? '=' + move.promotion.toUpperCase() : '');
  }
  const next = applyMove(pos, move);
  if (inCheck(next)) san += legalMoves(next).length === 0 ? '#' : '+';
  return san;
}

const normalizeSan = (s: string): string =>
  s
    .replace(/[+#!?]/g, '')
    .replace('=', '')
    .replace(/0/g, 'O');

/** Finds the legal move matching a SAN ("Nf3", "exd5", "O-O") or UCI ("e2e4", "e7e8q") string. */
export function parseMove(pos: Position, input: string): Move | null {
  const legal = legalMoves(pos);
  const text = input.trim();
  const uci = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(text);
  if (uci) {
    const from = parseSquare(uci[1]);
    const to = parseSquare(uci[2]);
    const promotion = uci[3] as PieceType | undefined;
    return legal.find((m) => m.from === from && m.to === to && m.promotion === promotion) ?? null;
  }
  const wanted = normalizeSan(text);
  return legal.find((m) => normalizeSan(toSan(pos, m, legal)) === wanted) ?? null;
}
