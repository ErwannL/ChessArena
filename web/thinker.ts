import { chooseMove } from '../src/bots/search';
import type { BotConfig } from '../src/bots/config';
import { parseFen } from '../src/engine/fen';
import { legalMoves, moveToUci } from '../src/engine/movegen';
import { toSan } from '../src/engine/san';

export interface ThinkRequest {
  id: number;
  fen: string;
  config: BotConfig;
  seen: string[];
}

export interface ThinkResult {
  id: number;
  uci: string | null;
  /** SAN of the move actually played. */
  played: string | null;
  score: number;
  nodes: number;
  ms: number;
  candidates: { san: string; score: number }[];
}

export function think(req: ThinkRequest): ThinkResult {
  const start = performance.now();
  const pos = parseFen(req.fen);
  const r = chooseMove(pos, req.config, { seenPositions: req.seen });
  const legal = legalMoves(pos);
  return {
    id: req.id,
    uci: r.move ? moveToUci(r.move) : null,
    played: r.move ? toSan(pos, r.move, legal) : null,
    score: r.score,
    nodes: r.nodes,
    ms: Math.round(performance.now() - start),
    candidates: r.candidates
      .slice(0, 5)
      .map((c) => ({ san: toSan(pos, c.move, legal), score: c.score })),
  };
}
