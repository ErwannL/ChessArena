import { opposite } from './board';
import { START_FEN, parseFen, positionKey, toFen } from './fen';
import { applyMove, inCheck, isInsufficientMaterial, legalMoves } from './movegen';
import { parseMove, toSan } from './san';
import type { Color, GameStatus, Move, PieceType, Position } from './types';

export interface MoveInput {
  from: number;
  to: number;
  promotion?: PieceType;
}

export interface PlayedMove extends Move {
  san: string;
}

/** A full chess game: positions history, rules and end-of-game detection. */
export class Game {
  private readonly positions: Position[];
  private readonly played: PlayedMove[] = [];
  private forced: GameStatus | null = null;
  readonly startFen: string;

  constructor(fen: string = START_FEN) {
    this.positions = [parseFen(fen)];
    this.startFen = toFen(this.positions[0]);
  }

  get position(): Position {
    return this.positions[this.positions.length - 1];
  }

  get turn(): Color {
    return this.position.turn;
  }

  fen(): string {
    return toFen(this.position);
  }

  moves(): Move[] {
    return this.status().over ? [] : legalMoves(this.position);
  }

  /** Legal moves starting from a square. */
  movesFrom(from: number): Move[] {
    return this.moves().filter((m) => m.from === from);
  }

  inCheck(): boolean {
    return inCheck(this.position);
  }

  move(input: string | MoveInput): PlayedMove {
    if (this.status().over) throw new Error('Game is over');
    const pos = this.position;
    const legal = legalMoves(pos);
    let move: Move | null | undefined;
    if (typeof input === 'string') {
      move = parseMove(pos, input);
    } else {
      const promotion = input.promotion ?? 'q';
      move = legal.find(
        (m) =>
          m.from === input.from && m.to === input.to && (!m.promotion || m.promotion === promotion),
      );
    }
    if (!move) throw new Error(`Illegal move: ${JSON.stringify(input)}`);
    const played: PlayedMove = { ...move, san: toSan(pos, move, legal) };
    this.positions.push(applyMove(pos, move));
    this.played.push(played);
    return played;
  }

  undo(): PlayedMove | null {
    this.forced = null;
    if (!this.played.length) return null;
    this.positions.pop();
    return this.played.pop()!;
  }

  history(): string[] {
    return this.played.map((m) => m.san);
  }

  moveList(): PlayedMove[] {
    return [...this.played];
  }

  lastMove(): PlayedMove | null {
    return this.played[this.played.length - 1] ?? null;
  }

  /** Repetition keys of every position reached so far. */
  positionKeys(): string[] {
    return this.positions.map(positionKey);
  }

  repetitionCount(): number {
    const key = positionKey(this.position);
    return this.positions.filter((p) => positionKey(p) === key).length;
  }

  resign(color: Color): void {
    this.forced = {
      over: true,
      result: color === 'w' ? '0-1' : '1-0',
      reason: 'resignation',
      winner: opposite(color),
    };
  }

  agreeDraw(): void {
    this.forced = { over: true, result: '1/2-1/2', reason: 'agreement' };
  }

  status(): GameStatus {
    if (this.forced) return this.forced;
    const pos = this.position;
    if (legalMoves(pos).length === 0) {
      if (inCheck(pos)) {
        const winner = opposite(pos.turn);
        return { over: true, result: winner === 'w' ? '1-0' : '0-1', reason: 'checkmate', winner };
      }
      return { over: true, result: '1/2-1/2', reason: 'stalemate' };
    }
    if (isInsufficientMaterial(pos.board))
      return { over: true, result: '1/2-1/2', reason: 'insufficient-material' };
    if (pos.halfmove >= 100) return { over: true, result: '1/2-1/2', reason: 'fifty-move' };
    if (this.repetitionCount() >= 3) return { over: true, result: '1/2-1/2', reason: 'threefold' };
    return { over: false, result: '*' };
  }

  pgn(headers: Record<string, string> = {}): string {
    const result = this.status().result;
    const tags: Record<string, string> = { Event: 'ChessArena', ...headers, Result: result };
    if (this.startFen !== START_FEN) {
      tags.SetUp = '1';
      tags.FEN = this.startFen;
    }
    const head = Object.entries(tags)
      .map(([k, v]) => `[${k} "${v.replace(/"/g, "'")}"]`)
      .join('\n');
    const first = this.positions[0];
    let moveNo = first.fullmove;
    const tokens: string[] = [];
    this.played.forEach((m, i) => {
      if (m.color === 'w') tokens.push(`${moveNo}.`);
      else if (i === 0) tokens.push(`${moveNo}...`);
      tokens.push(m.san);
      if (m.color === 'b') moveNo++;
    });
    tokens.push(result);
    return `${head}\n\n${tokens.join(' ')}\n`;
  }
}
