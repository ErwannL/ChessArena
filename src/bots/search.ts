import { positionKey, toFen } from '../engine/fen';
import {
  applyMove,
  inCheck,
  isInsufficientMaterial,
  legalMoves,
  moveOrderScore,
  moveToUci,
  pseudoMoves,
} from '../engine/movegen';
import type { Move, Position } from '../engine/types';
import { EvalContext } from './context';
import type { BotConfig } from './config';
import { getHeuristic, type Heuristic } from './heuristics';

export const MATE = 100_000;
const INF = 1_000_000;
const QUIESCENCE_DEPTH = 6;

export interface Candidate {
  move: Move;
  uci: string;
  score: number;
}

export interface SearchResult {
  move: Move | null;
  score: number;
  nodes: number;
  /** Every root move with its score, best first. */
  candidates: Candidate[];
  fen: string;
}

export interface SearchOptions {
  /** Random source in [0, 1) — injectable for reproducible games/tests. */
  rng?: () => number;
  /** Hard cap on visited nodes; the search degrades gracefully to static evaluation. */
  maxNodes?: number;
  /** Keys (see `positionKey`) of positions already reached in the game: revisiting one scores as a draw. */
  seenPositions?: Iterable<string>;
}

type Weighted = { heuristic: Heuristic; weight: number };

export function resolveHeuristics(config: BotConfig): Weighted[] {
  return config.heuristics.flatMap(({ id, weight }) => {
    const heuristic = getHeuristic(id);
    return heuristic ? [{ heuristic, weight }] : [];
  });
}

/** Static evaluation from the side-to-move point of view. */
export function evaluate(pos: Position, weighted: Weighted[]): number {
  const ctx = new EvalContext(pos);
  let score = 0;
  for (const { heuristic, weight } of weighted) score += weight * heuristic.evaluate(ctx);
  return Math.round(pos.turn === 'w' ? score : -score);
}

const byOrder = (a: Move, b: Move): number => moveOrderScore(b) - moveOrderScore(a);

class Searcher {
  nodes = 0;

  constructor(
    private readonly weighted: Weighted[],
    private readonly config: BotConfig,
    private readonly maxNodes: number,
  ) {}

  private terminal(pos: Position, moves: Move[], ply: number): number | null {
    if (!moves.length) return inCheck(pos) ? -MATE + ply : 0;
    if (pos.halfmove >= 100 || isInsufficientMaterial(pos.board)) return 0;
    return null;
  }

  /** Static evaluation, except that checkmates are always recognised. */
  private leaf(pos: Position, ply: number): number {
    if (inCheck(pos) && legalMoves(pos).length === 0) return -MATE + ply;
    return evaluate(pos, this.weighted);
  }

  /** Keeps searching captures only, so the evaluation never stops mid-exchange. */
  quiesce(pos: Position, alpha: number, beta: number, ply: number, left: number): number {
    this.nodes++;
    const stand = this.leaf(pos, ply);
    if (stand >= beta || left <= 0 || this.nodes >= this.maxNodes || stand <= -MATE + 1000)
      return stand;
    alpha = Math.max(alpha, stand);
    const tactical = pseudoMoves(pos)
      .filter((m) => m.captured || m.promotion)
      .sort(byOrder);
    for (const m of tactical) {
      const next = applyMove(pos, m);
      if (inCheck(next, pos.turn)) continue;
      const score = -this.quiesce(next, -beta, -alpha, ply + 1, left - 1);
      if (score >= beta) return score;
      alpha = Math.max(alpha, score);
    }
    return alpha;
  }

  negamax(pos: Position, depth: number, alpha: number, beta: number, ply: number): number {
    if (depth <= 0) {
      if (this.config.quiescence) return this.quiesce(pos, alpha, beta, ply, QUIESCENCE_DEPTH);
      this.nodes++;
      return this.leaf(pos, ply);
    }
    this.nodes++;
    const moves = legalMoves(pos);
    const end = this.terminal(pos, moves, ply);
    if (end !== null) return end;
    if (this.nodes >= this.maxNodes) return evaluate(pos, this.weighted);
    moves.sort(byOrder);
    let best = -INF;
    for (const m of moves) {
      const score = -this.negamax(applyMove(pos, m), depth - 1, -beta, -alpha, ply + 1);
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    return best;
  }
}

/** Runs the bot's reasoning on a position and picks a move. */
export function chooseMove(
  pos: Position,
  config: BotConfig,
  options: SearchOptions = {},
): SearchResult {
  const { rng = Math.random, maxNodes = 60_000 } = options;
  const seen = new Set(options.seenPositions ?? []);
  const searcher = new Searcher(resolveHeuristics(config), config, maxNodes);
  const moves = legalMoves(pos).sort(byOrder);
  const fen = toFen(pos);
  if (!moves.length) {
    return { move: null, score: inCheck(pos) ? -MATE : 0, nodes: 0, candidates: [], fen };
  }
  // Root window: a move is only worth an exact score if it may be within `randomness` of the best.
  const candidates: Candidate[] = [];
  let best = -INF;
  for (const move of moves) {
    const floor = best - config.randomness - 1;
    const next = applyMove(pos, move);
    const score = seen.has(positionKey(next))
      ? 0
      : 0 - searcher.negamax(next, config.depth - 1, -INF, -floor, 1);
    best = Math.max(best, score);
    candidates.push({ move, uci: moveToUci(move), score });
  }
  candidates.sort((a, b) => b.score - a.score);
  // Never randomise away a forced mate.
  const tolerance = Math.abs(best) >= MATE - 1000 ? 0 : config.randomness;
  const pool = candidates.filter((c) => c.score >= best - tolerance);
  const picked = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  return { move: picked.move, score: picked.score, nodes: searcher.nodes, candidates, fen };
}

/** Deterministic PRNG (mulberry32) for reproducible bot games. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
