import type { ArenaApi, HeuristicInfo } from '../src/client/api';
import type { GameSession } from '../src/client/session';

export interface Series {
  total: number;
  played: number;
  /** Points per seat id (bot player ids). */
  points: Record<string, number>;
}

export const state: {
  api: ArenaApi;
  heuristics: HeuristicInfo[];
  session: GameSession | null;
  series: Series | null;
  eveDelay: number;
} = {
  api: null as unknown as ArenaApi,
  heuristics: [],
  session: null,
  series: null,
  eveDelay: 600,
};

const PREFS_KEY = 'chessarena:prefs';

export function loadPrefs(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function savePrefs(patch: Record<string, string>): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadPrefs(), ...patch }));
  } catch {
    // storage unavailable (private mode…)
  }
}
