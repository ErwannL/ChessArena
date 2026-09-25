import { charToPiece, parseSquare, pieceToChar, squareName, square, offset } from './board';
import type { Board, Castling, Position } from './types';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function parseFen(fen: string): Position {
  const parts = fen.trim().split(/\s+/);
  if (parts.length !== 4 && parts.length !== 6) throw new Error('FEN must have 4 or 6 fields');
  const [placement, turn, castlingStr, epStr, half = '0', full = '1'] = parts;

  const rows = placement.split('/');
  if (rows.length !== 8) throw new Error('FEN board must have 8 ranks');
  const board: Board = new Array(64).fill(null);
  rows.forEach((row, i) => {
    const rank = 7 - i;
    let file = 0;
    for (const ch of row) {
      if (/[1-8]/.test(ch)) {
        file += Number(ch);
      } else {
        const p = charToPiece(ch);
        if (!p) throw new Error(`Invalid FEN piece: ${ch}`);
        if (file > 7) throw new Error('FEN rank overflow');
        board[square(file, rank)] = p;
        file += 1;
      }
    }
    if (file !== 8) throw new Error(`FEN rank ${rank + 1} does not have 8 files`);
  });

  for (const color of ['w', 'b'] as const) {
    const kings = board.filter((p) => p?.type === 'k' && p.color === color).length;
    if (kings !== 1) throw new Error(`FEN must contain exactly one ${color} king`);
  }

  if (turn !== 'w' && turn !== 'b') throw new Error('FEN side to move must be w or b');
  if (!/^(-|(?=.)K?Q?k?q?)$/.test(castlingStr)) throw new Error('Invalid FEN castling field');
  const castling: Castling = {
    wk: castlingStr.includes('K'),
    wq: castlingStr.includes('Q'),
    bk: castlingStr.includes('k'),
    bq: castlingStr.includes('q'),
  };
  const ep = epStr === '-' ? null : parseSquare(epStr);
  const halfmove = Number(half);
  const fullmove = Number(full);
  if (!Number.isInteger(halfmove) || halfmove < 0 || !Number.isInteger(fullmove) || fullmove < 1)
    throw new Error('Invalid FEN move counters');

  return { board, turn, castling, ep, halfmove, fullmove };
}

function placementOf(board: Board): string {
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const p = board[square(file, rank)];
      if (!p) {
        empty++;
        continue;
      }
      if (empty) row += String(empty);
      empty = 0;
      row += pieceToChar(p);
    }
    if (empty) row += String(empty);
    rows.push(row);
  }
  return rows.join('/');
}

function castlingOf(c: Castling): string {
  const s = (c.wk ? 'K' : '') + (c.wq ? 'Q' : '') + (c.bk ? 'k' : '') + (c.bq ? 'q' : '');
  return s || '-';
}

export function toFen(pos: Position): string {
  return [
    placementOf(pos.board),
    pos.turn,
    castlingOf(pos.castling),
    pos.ep === null ? '-' : squareName(pos.ep),
    pos.halfmove,
    pos.fullmove,
  ].join(' ');
}

/** Whether an en-passant capture is actually available for the side to move. */
function epCapturable(pos: Position): boolean {
  if (pos.ep === null) return false;
  const back = pos.turn === 'w' ? -1 : 1;
  return [-1, 1].some((df) => {
    const s = offset(pos.ep!, df, back);
    const p = s >= 0 ? pos.board[s] : null;
    return p?.type === 'p' && p.color === pos.turn;
  });
}

/** Key identifying a position for repetition detection. */
export function positionKey(pos: Position): string {
  const ep = epCapturable(pos) ? squareName(pos.ep!) : '-';
  return `${placementOf(pos.board)} ${pos.turn} ${castlingOf(pos.castling)} ${ep}`;
}
