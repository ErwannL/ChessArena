import { HEURISTICS, getHeuristic } from './heuristics';

export interface WeightedHeuristic {
  id: string;
  /** Importance of this reasoning type, 0 – 3. */
  weight: number;
}

export interface BotConfig {
  heuristics: WeightedHeuristic[];
  /** Look-ahead in plies (half-moves), 1 – 5. */
  depth: number;
  /** Extend the search on captures so the bot does not stop in the middle of an exchange. */
  quiescence: boolean;
  /** Tolerance in centipawns: any move this close to the best one can be picked at random. */
  randomness: number;
}

export const LIMITS = {
  depth: { min: 1, max: 5 },
  weight: { min: 0, max: 3 },
  randomness: { min: 0, max: 1000 },
} as const;

export const DEFAULT_CONFIG: BotConfig = {
  heuristics: [{ id: 'material', weight: 1 }],
  depth: 2,
  quiescence: false,
  randomness: 0,
};

const clamp = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
};

/** Sanitises untrusted input into a valid bot configuration. */
export function normalizeBotConfig(input: unknown): BotConfig {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const seen = new Set<string>();
  const heuristics: WeightedHeuristic[] = [];
  if (Array.isArray(raw.heuristics)) {
    for (const h of raw.heuristics as Record<string, unknown>[]) {
      const id = typeof h?.id === 'string' ? h.id : '';
      if (!getHeuristic(id) || seen.has(id)) continue;
      seen.add(id);
      const weight = clamp(h.weight, LIMITS.weight.min, LIMITS.weight.max, 1);
      if (weight > 0) heuristics.push({ id, weight: Math.round(weight * 100) / 100 });
    }
  }
  return {
    heuristics: heuristics.length ? heuristics : [...DEFAULT_CONFIG.heuristics],
    depth: Math.round(clamp(raw.depth, LIMITS.depth.min, LIMITS.depth.max, DEFAULT_CONFIG.depth)),
    quiescence: raw.quiescence === true,
    randomness: Math.round(clamp(raw.randomness, LIMITS.randomness.min, LIMITS.randomness.max, 0)),
  };
}

/** Rough strength estimate (used to seed a new bot's rating). */
export function estimateStrength(config: BotConfig): number {
  const variety = config.heuristics.length / HEURISTICS.length;
  const base = 600 + config.depth * 180 + variety * 300 + (config.quiescence ? 150 : 0);
  return Math.round(Math.max(400, base - config.randomness * 1.5));
}
