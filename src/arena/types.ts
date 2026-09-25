import type { BotConfig } from '../bots/config';
import type { EndReason, Result } from '../engine/types';

export type PlayerKind = 'human' | 'bot';
export type GameMode = 'pvp' | 'pve' | 'eve';
export type Outcome = 'W' | 'D' | 'L';

export interface BotSpec {
  avatar: string;
  description: string;
  config: BotConfig;
  /** Preset this bot was created from, if any. */
  preset?: string;
}

export interface ColorStats {
  games: number;
  wins: number;
  draws: number;
  losses: number;
}

export interface RatingPoint {
  at: number;
  rating: number;
}

export interface PlayerRecord {
  id: string;
  name: string;
  kind: PlayerKind;
  /** Only ranked players appear in the default leaderboard and play rated games. */
  ranked: boolean;
  rating: number;
  peak: number;
  lowest: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** >0: current winning streak, <0: current losing streak. */
  streak: number;
  bestStreak: number;
  asWhite: ColorStats;
  asBlack: ColorStats;
  /** Sum of opponents' ratings (for the performance rating). */
  opponentsRatingSum: number;
  /** Last results, most recent last (max 10). */
  recent: Outcome[];
  /** Rating after each game (max 100 points). */
  history: RatingPoint[];
  createdAt: number;
  lastPlayedAt: number | null;
  bot?: BotSpec;
}

export interface GameRecord {
  id: string;
  mode: GameMode;
  whiteId: string;
  blackId: string;
  whiteName: string;
  blackName: string;
  result: Exclude<Result, '*'>;
  reason: EndReason;
  moves: string[];
  pgn: string;
  rated: boolean;
  whiteRatingBefore: number;
  blackRatingBefore: number;
  whiteDelta: number;
  blackDelta: number;
  playedAt: number;
}

export interface Database {
  version: 1;
  players: PlayerRecord[];
  games: GameRecord[];
}

export type LeaderboardSort =
  'rating' | 'peak' | 'games' | 'wins' | 'winRate' | 'streak' | 'performance';

export interface LeaderboardQuery {
  kind?: 'all' | PlayerKind;
  includeUnranked?: boolean;
  minGames?: number;
  sort?: LeaderboardSort;
  search?: string;
}

export interface LeaderboardRow {
  rank: number;
  id: string;
  name: string;
  kind: PlayerKind;
  ranked: boolean;
  avatar: string;
  rating: number;
  peak: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  drawRate: number;
  streak: number;
  bestStreak: number;
  performance: number | null;
  form: Outcome[];
  trend: number;
  lastPlayedAt: number | null;
}

export interface HeadToHead {
  opponentId: string;
  opponentName: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
}

export interface PlayerProfile {
  player: PlayerRecord;
  rank: number | null;
  headToHead: HeadToHead[];
  recentGames: GameRecord[];
}

export interface NewPlayerInput {
  name: string;
  kind: PlayerKind;
  ranked?: boolean;
  bot?: BotInput;
}

export interface PlayerPatch {
  name?: string;
  ranked?: boolean;
  bot?: BotInput;
}

export interface NewGameInput {
  whiteId: string;
  blackId: string;
  moves: string[];
  result: Exclude<Result, '*'>;
  reason: EndReason;
  mode?: GameMode;
}

export interface GamesQuery {
  playerId?: string;
  limit?: number;
  offset?: number;
}

export interface ArenaStats {
  players: number;
  humans: number;
  bots: number;
  games: number;
  whiteWins: number;
  blackWins: number;
  draws: number;
  averageLength: number;
  reasons: Partial<Record<EndReason, number>>;
}

export type BotInput = Partial<Omit<BotSpec, 'config'>> & { config?: unknown };
