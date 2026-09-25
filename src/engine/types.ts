export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Piece {
  readonly type: PieceType;
  readonly color: Color;
}

export type Board = (Piece | null)[];

export interface Castling {
  wk: boolean;
  wq: boolean;
  bk: boolean;
  bq: boolean;
}

export interface Position {
  board: Board;
  turn: Color;
  castling: Castling;
  /** En-passant target square (index) or null. */
  ep: number | null;
  halfmove: number;
  fullmove: number;
}

export interface Move {
  from: number;
  to: number;
  piece: PieceType;
  color: Color;
  captured?: PieceType;
  promotion?: PieceType;
  castle?: 'k' | 'q';
  enPassant?: boolean;
  double?: boolean;
}

export type Result = '1-0' | '0-1' | '1/2-1/2' | '*';

export type EndReason =
  | 'checkmate'
  | 'stalemate'
  | 'fifty-move'
  | 'threefold'
  | 'insufficient-material'
  | 'resignation'
  | 'agreement';

export interface GameStatus {
  over: boolean;
  result: Result;
  reason?: EndReason;
  winner?: Color;
}
