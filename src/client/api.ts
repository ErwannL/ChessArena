import { ApiError, Repository, loadDatabase } from '../arena/repository';
import type {
  ArenaStats,
  GameRecord,
  GamesQuery,
  LeaderboardQuery,
  LeaderboardRow,
  NewGameInput,
  NewPlayerInput,
  PlayerKind,
  PlayerPatch,
  PlayerProfile,
  PlayerRecord,
} from '../arena/types';
import { HEURISTICS } from '../bots/heuristics';
import { BOT_PRESETS, type BotPreset } from '../bots/presets';

export interface HeuristicInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
}

/** Everything the web client needs — implemented over HTTP or fully offline. */
export interface ArenaApi {
  readonly mode: 'server' | 'local';
  stats(): Promise<ArenaStats>;
  heuristics(): Promise<HeuristicInfo[]>;
  presets(): Promise<BotPreset[]>;
  players(kind?: PlayerKind): Promise<PlayerRecord[]>;
  createPlayer(input: NewPlayerInput): Promise<PlayerRecord>;
  profile(id: string): Promise<PlayerProfile>;
  updatePlayer(id: string, patch: PlayerPatch): Promise<PlayerRecord>;
  deletePlayer(id: string): Promise<void>;
  leaderboard(query?: LeaderboardQuery): Promise<LeaderboardRow[]>;
  games(query?: GamesQuery): Promise<GameRecord[]>;
  game(id: string): Promise<GameRecord>;
  recordGame(input: NewGameInput): Promise<GameRecord>;
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

function queryString(params: object): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

export class HttpApi implements ArenaApi {
  readonly mode = 'server';

  constructor(
    private readonly fetchFn: FetchFn,
    private readonly base = '',
  ) {}

  private async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const res = await this.fetchFn(this.base + path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error ?? `Erreur ${res.status}`);
    return data as T;
  }

  stats = () => this.request<ArenaStats>('/api/stats');
  heuristics = () => this.request<HeuristicInfo[]>('/api/heuristics');
  presets = () => this.request<BotPreset[]>('/api/presets');
  players = (kind?: PlayerKind) =>
    this.request<PlayerRecord[]>(`/api/players${queryString({ kind })}`);
  createPlayer = (input: NewPlayerInput) =>
    this.request<PlayerRecord>('/api/players', 'POST', input);
  profile = (id: string) => this.request<PlayerProfile>(`/api/players/${encodeURIComponent(id)}`);
  updatePlayer = (id: string, patch: PlayerPatch) =>
    this.request<PlayerRecord>(`/api/players/${encodeURIComponent(id)}`, 'PATCH', patch);
  deletePlayer = async (id: string) => {
    await this.request(`/api/players/${encodeURIComponent(id)}`, 'DELETE');
  };
  leaderboard = (query: LeaderboardQuery = {}) =>
    this.request<LeaderboardRow[]>(`/api/leaderboard${queryString(query)}`);
  games = (query: GamesQuery = {}) => this.request<GameRecord[]>(`/api/games${queryString(query)}`);
  game = (id: string) => this.request<GameRecord>(`/api/games/${encodeURIComponent(id)}`);
  recordGame = (input: NewGameInput) => this.request<GameRecord>('/api/games', 'POST', input);
}

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Offline implementation: same rules as the server, persisted in localStorage. */
export class LocalApi implements ArenaApi {
  readonly mode = 'local';
  private readonly repo: Repository;

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly key = 'chessarena:db',
  ) {
    let raw: unknown;
    try {
      raw = JSON.parse(storage.getItem(key) ?? 'null');
    } catch {
      raw = null;
    }
    this.repo = new Repository(loadDatabase(raw));
    if (this.repo.seedPresets()) this.persist();
  }

  private persist(): void {
    this.storage.setItem(this.key, JSON.stringify(this.repo.snapshot()));
  }

  private async mutate<T>(fn: () => T): Promise<T> {
    const value = fn();
    this.persist();
    return structuredClone(value);
  }

  private async read<T>(fn: () => T): Promise<T> {
    return structuredClone(fn());
  }

  stats = () => this.read(() => this.repo.stats());
  heuristics = () =>
    this.read(() =>
      HEURISTICS.map(({ id, name, icon, description }) => ({ id, name, icon, description })),
    );
  presets = () => this.read(() => BOT_PRESETS);
  players = (kind?: PlayerKind) => this.read(() => this.repo.listPlayers(kind));
  createPlayer = (input: NewPlayerInput) => this.mutate(() => this.repo.createPlayer(input));
  profile = (id: string) => this.read(() => this.repo.profile(id));
  updatePlayer = (id: string, patch: PlayerPatch) =>
    this.mutate(() => this.repo.updatePlayer(id, patch));
  deletePlayer = (id: string) => this.mutate(() => this.repo.deletePlayer(id));
  leaderboard = (query?: LeaderboardQuery) => this.read(() => this.repo.leaderboard(query));
  games = (query?: GamesQuery) => this.read(() => this.repo.listGames(query));
  game = (id: string) => this.read(() => this.repo.getGame(id));
  recordGame = (input: NewGameInput) => this.mutate(() => this.repo.recordGame(input));
}

/** Uses the server when it answers, otherwise falls back to offline mode. */
export async function connectApi(
  fetchFn: FetchFn,
  storage: KeyValueStorage,
  timeoutMs = 2500,
): Promise<ArenaApi> {
  try {
    const res = await Promise.race([
      fetchFn('/api/health'),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    const body = await res.json();
    if (res.ok && body?.status === 'ok') return new HttpApi(fetchFn);
  } catch {
    // offline
  }
  return new LocalApi(storage);
}
