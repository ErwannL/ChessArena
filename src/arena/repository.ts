import { estimateStrength, normalizeBotConfig } from '../bots/config';
import { BOT_PRESETS } from '../bots/presets';
import { Game } from '../engine/game';
import type { EndReason } from '../engine/types';
import { DEFAULT_RATING, performanceRating, rateGame, resultToScore } from '../rating/elo';
import type {
  ArenaStats,
  BotSpec,
  ColorStats,
  Database,
  GameMode,
  GameRecord,
  GamesQuery,
  HeadToHead,
  LeaderboardQuery,
  LeaderboardRow,
  NewGameInput,
  NewPlayerInput,
  Outcome,
  PlayerKind,
  PlayerPatch,
  PlayerProfile,
  PlayerRecord,
} from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RepositoryOptions {
  now?: () => number;
  id?: () => string;
}

const RECENT_MAX = 10;
const HISTORY_MAX = 100;
const NATURAL_ENDINGS: EndReason[] = [
  'checkmate',
  'stalemate',
  'fifty-move',
  'threefold',
  'insufficient-material',
];
const REASONS: EndReason[] = [...NATURAL_ENDINGS, 'resignation', 'agreement'];
const RESULTS = ['1-0', '0-1', '1/2-1/2'];
const DEFAULT_AVATAR: Record<PlayerKind, string> = { human: '🙂', bot: '🤖' };

export const defaultId = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

const emptyColorStats = (): ColorStats => ({ games: 0, wins: 0, draws: 0, losses: 0 });

export function emptyDatabase(): Database {
  return { version: 1, players: [], games: [] };
}

/** Accepts persisted data of unknown shape; falls back to an empty database. */
export function loadDatabase(raw: unknown): Database {
  const db = raw as Partial<Database> | null;
  if (!db || db.version !== 1 || !Array.isArray(db.players) || !Array.isArray(db.games)) {
    return emptyDatabase();
  }
  return { version: 1, players: db.players, games: db.games };
}

function cleanName(name: unknown): string {
  if (typeof name !== 'string') throw new ApiError(400, 'Le nom est obligatoire');
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 2 || trimmed.length > 24)
    throw new ApiError(400, 'Le nom doit faire entre 2 et 24 caractères');
  return trimmed;
}

const cleanText = (v: unknown, max: number, fallback: string): string =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback;

export class Repository {
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(
    private readonly db: Database = emptyDatabase(),
    options: RepositoryOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.newId = options.id ?? defaultId;
  }

  snapshot(): Database {
    return this.db;
  }

  // ---------------------------------------------------------------- players

  listPlayers(kind?: PlayerKind): PlayerRecord[] {
    return this.db.players.filter((p) => !kind || p.kind === kind);
  }

  getPlayer(id: string): PlayerRecord {
    const player = this.db.players.find((p) => p.id === id);
    if (!player) throw new ApiError(404, 'Joueur introuvable');
    return player;
  }

  private assertUniqueName(name: string, exceptId?: string): void {
    const lower = name.toLowerCase();
    if (this.db.players.some((p) => p.id !== exceptId && p.name.toLowerCase() === lower))
      throw new ApiError(409, `Le nom « ${name} » est déjà pris`);
  }

  private botSpec(input: NewPlayerInput['bot'], previous?: BotSpec): BotSpec {
    const spec: BotSpec = {
      avatar: cleanText(input?.avatar, 8, previous?.avatar ?? DEFAULT_AVATAR.bot),
      description: cleanText(input?.description, 200, previous?.description ?? ''),
      config: normalizeBotConfig(input?.config ?? previous?.config),
    };
    const preset = input?.preset ?? previous?.preset;
    if (typeof preset === 'string') spec.preset = preset;
    return spec;
  }

  createPlayer(input: NewPlayerInput): PlayerRecord {
    const name = cleanName(input?.name);
    if (input.kind !== 'human' && input.kind !== 'bot')
      throw new ApiError(400, 'Type de joueur invalide');
    this.assertUniqueName(name);
    const bot = input.kind === 'bot' ? this.botSpec(input.bot) : undefined;
    const rating = bot ? estimateStrength(bot.config) : DEFAULT_RATING;
    const createdAt = this.now();
    const player: PlayerRecord = {
      id: this.newId(),
      name,
      kind: input.kind,
      ranked: input.ranked ?? true,
      rating,
      peak: rating,
      lowest: rating,
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      streak: 0,
      bestStreak: 0,
      asWhite: emptyColorStats(),
      asBlack: emptyColorStats(),
      opponentsRatingSum: 0,
      recent: [],
      history: [{ at: createdAt, rating }],
      createdAt,
      lastPlayedAt: null,
      ...(bot && { bot }),
    };
    this.db.players.push(player);
    return player;
  }

  updatePlayer(id: string, patch: PlayerPatch): PlayerRecord {
    const player = this.getPlayer(id);
    if (patch.name !== undefined) {
      const name = cleanName(patch.name);
      this.assertUniqueName(name, id);
      player.name = name;
    }
    if (patch.ranked !== undefined) player.ranked = patch.ranked === true;
    if (patch.bot !== undefined) {
      if (player.kind !== 'bot') throw new ApiError(400, 'Seul un bot a une configuration');
      player.bot = this.botSpec(patch.bot, player.bot);
    }
    return player;
  }

  deletePlayer(id: string): void {
    const player = this.getPlayer(id);
    this.db.players.splice(this.db.players.indexOf(player), 1);
  }

  /** Adds the built-in bots if no bot exists yet. Returns how many were created. */
  seedPresets(): number {
    if (this.listPlayers('bot').length) return 0;
    for (const preset of BOT_PRESETS) {
      this.createPlayer({
        name: preset.name,
        kind: 'bot',
        bot: {
          avatar: preset.avatar,
          description: preset.description,
          config: preset.config,
          preset: preset.key,
        },
      });
    }
    return BOT_PRESETS.length;
  }

  // ------------------------------------------------------------ leaderboard

  leaderboard(query: LeaderboardQuery = {}): LeaderboardRow[] {
    const { kind = 'all', includeUnranked = false, minGames = 0, sort = 'rating' } = query;
    const search = query.search?.trim().toLowerCase();
    const rows = this.db.players
      .filter(
        (p) =>
          (kind === 'all' || p.kind === kind) &&
          (includeUnranked || p.ranked) &&
          p.games >= minGames &&
          (!search || p.name.toLowerCase().includes(search)),
      )
      .map((p) => this.row(p));
    rows.sort((a, b) => sortValue(b, sort) - sortValue(a, sort) || b.rating - a.rating);
    rows.forEach((r, i) => (r.rank = i + 1));
    return rows;
  }

  private row(p: PlayerRecord): LeaderboardRow {
    const games = p.games || 1;
    const previous = p.history[Math.max(0, p.history.length - 6)].rating;
    return {
      rank: 0,
      id: p.id,
      name: p.name,
      kind: p.kind,
      ranked: p.ranked,
      avatar: p.bot?.avatar ?? DEFAULT_AVATAR[p.kind],
      rating: p.rating,
      peak: p.peak,
      games: p.games,
      wins: p.wins,
      draws: p.draws,
      losses: p.losses,
      winRate: Math.round((p.wins / games) * 1000) / 10,
      drawRate: Math.round((p.draws / games) * 1000) / 10,
      streak: p.streak,
      bestStreak: p.bestStreak,
      performance: performanceRating(p.opponentsRatingSum, p.games, p.wins, p.losses),
      form: p.recent.slice(-5),
      trend: p.rating - previous,
      lastPlayedAt: p.lastPlayedAt,
    };
  }

  profile(id: string): PlayerProfile {
    const player = this.getPlayer(id);
    const games = this.db.games.filter((g) => g.whiteId === id || g.blackId === id);
    const h2h = new Map<string, HeadToHead>();
    for (const g of games) {
      const white = g.whiteId === id;
      const opponentId = white ? g.blackId : g.whiteId;
      const entry = h2h.get(opponentId) ?? {
        opponentId,
        opponentName: white ? g.blackName : g.whiteName,
        games: 0,
        wins: 0,
        draws: 0,
        losses: 0,
      };
      entry.games++;
      const outcome = outcomeFor(g, white);
      if (outcome === 'W') entry.wins++;
      else if (outcome === 'L') entry.losses++;
      else entry.draws++;
      h2h.set(opponentId, entry);
    }
    const ranked = player.ranked
      ? this.leaderboard({ kind: 'all' }).find((r) => r.id === id)!.rank
      : null;
    return {
      player,
      rank: ranked,
      headToHead: [...h2h.values()].sort((a, b) => b.games - a.games),
      recentGames: games.slice(-20).reverse(),
    };
  }

  stats(): ArenaStats {
    const { players, games } = this.db;
    const reasons: ArenaStats['reasons'] = {};
    for (const g of games) reasons[g.reason] = (reasons[g.reason] ?? 0) + 1;
    const totalMoves = games.reduce((n, g) => n + g.moves.length, 0);
    return {
      players: players.length,
      humans: players.filter((p) => p.kind === 'human').length,
      bots: players.filter((p) => p.kind === 'bot').length,
      games: games.length,
      whiteWins: games.filter((g) => g.result === '1-0').length,
      blackWins: games.filter((g) => g.result === '0-1').length,
      draws: games.filter((g) => g.result === '1/2-1/2').length,
      averageLength: games.length ? Math.round(totalMoves / games.length) : 0,
      reasons,
    };
  }

  // ------------------------------------------------------------------ games

  listGames(query: GamesQuery = {}): GameRecord[] {
    const limit = Math.min(200, Math.max(1, query.limit ?? 50));
    const offset = Math.max(0, query.offset ?? 0);
    return this.db.games
      .filter(
        (g) => !query.playerId || g.whiteId === query.playerId || g.blackId === query.playerId,
      )
      .reverse()
      .slice(offset, offset + limit);
  }

  getGame(id: string): GameRecord {
    const game = this.db.games.find((g) => g.id === id);
    if (!game) throw new ApiError(404, 'Partie introuvable');
    return game;
  }

  /** Validates a finished game by replaying it, then updates both players' ratings and stats. */
  recordGame(input: NewGameInput): GameRecord {
    const white = this.getPlayer(input?.whiteId);
    const black = this.getPlayer(input.blackId);
    if (white.id === black.id)
      throw new ApiError(400, 'Un joueur ne peut pas s’affronter lui-même');
    if (!RESULTS.includes(input.result)) throw new ApiError(400, 'Résultat invalide');
    if (!REASONS.includes(input.reason)) throw new ApiError(400, 'Motif de fin invalide');
    if (!Array.isArray(input.moves)) throw new ApiError(400, 'Liste de coups invalide');

    const mode = modeFor(white.kind, black.kind);
    if (input.mode !== undefined && input.mode !== mode)
      throw new ApiError(400, `Mode ${input.mode} incompatible avec les joueurs`);

    const game = new Game();
    for (const move of input.moves) {
      try {
        game.move(String(move));
      } catch {
        throw new ApiError(400, `Coup illégal : ${String(move)}`);
      }
    }
    const status = game.status();
    if (NATURAL_ENDINGS.includes(input.reason)) {
      if (status.reason !== input.reason || status.result !== input.result)
        throw new ApiError(400, 'Le résultat ne correspond pas à la position finale');
    } else {
      if (status.over) throw new ApiError(400, 'La partie était déjà terminée');
      if ((input.reason === 'agreement') !== (input.result === '1/2-1/2'))
        throw new ApiError(400, 'Le résultat ne correspond pas au motif');
      if (input.reason === 'resignation') {
        game.resign(input.result === '1-0' ? 'b' : 'w');
      } else {
        game.agreeDraw();
      }
    }

    const rated = white.ranked && black.ranked;
    const score = resultToScore(input.result)!;
    const elo = rated
      ? rateGame(white, black, score)
      : { white: white.rating, black: black.rating, whiteDelta: 0, blackDelta: 0 };
    const playedAt = this.now();
    const record: GameRecord = {
      id: this.newId(),
      mode,
      whiteId: white.id,
      blackId: black.id,
      whiteName: white.name,
      blackName: black.name,
      result: input.result,
      reason: input.reason,
      moves: game.history(),
      pgn: game.pgn({
        Site: 'ChessArena',
        Date: new Date(playedAt).toISOString().slice(0, 10).replace(/-/g, '.'),
        White: white.name,
        Black: black.name,
        WhiteElo: String(white.rating),
        BlackElo: String(black.rating),
        Termination: input.reason,
      }),
      rated,
      whiteRatingBefore: white.rating,
      blackRatingBefore: black.rating,
      whiteDelta: elo.whiteDelta,
      blackDelta: elo.blackDelta,
      playedAt,
    };
    applyResult(white, 'w', score, elo.white, black.rating, playedAt);
    applyResult(black, 'b', 1 - score, elo.black, record.whiteRatingBefore, playedAt);
    this.db.games.push(record);
    return record;
  }
}

function modeFor(white: PlayerKind, black: PlayerKind): GameMode {
  if (white === 'human' && black === 'human') return 'pvp';
  if (white === 'bot' && black === 'bot') return 'eve';
  return 'pve';
}

function outcomeFor(g: GameRecord, asWhite: boolean): Outcome {
  if (g.result === '1/2-1/2') return 'D';
  return (g.result === '1-0') === asWhite ? 'W' : 'L';
}

function applyResult(
  p: PlayerRecord,
  color: 'w' | 'b',
  score: number,
  newRating: number,
  opponentRating: number,
  at: number,
): void {
  const outcome: Outcome = score === 1 ? 'W' : score === 0 ? 'L' : 'D';
  const side = color === 'w' ? p.asWhite : p.asBlack;
  p.games++;
  side.games++;
  if (outcome === 'W') {
    p.wins++;
    side.wins++;
    p.streak = p.streak > 0 ? p.streak + 1 : 1;
  } else if (outcome === 'L') {
    p.losses++;
    side.losses++;
    p.streak = p.streak < 0 ? p.streak - 1 : -1;
  } else {
    p.draws++;
    side.draws++;
    p.streak = 0;
  }
  p.bestStreak = Math.max(p.bestStreak, p.streak);
  p.opponentsRatingSum += opponentRating;
  p.rating = newRating;
  p.peak = Math.max(p.peak, newRating);
  p.lowest = Math.min(p.lowest, newRating);
  p.recent = [...p.recent, outcome].slice(-RECENT_MAX);
  p.history = [...p.history, { at, rating: newRating }].slice(-HISTORY_MAX);
  p.lastPlayedAt = at;
}

function sortValue(r: LeaderboardRow, sort: LeaderboardQuery['sort']): number {
  switch (sort) {
    case 'peak':
      return r.peak;
    case 'games':
      return r.games;
    case 'wins':
      return r.wins;
    case 'winRate':
      return r.winRate;
    case 'streak':
      return r.streak;
    case 'performance':
      return r.performance ?? -Infinity;
    default:
      return r.rating;
  }
}
