import { beforeEach, describe, expect, it } from 'vitest';
import {
  ApiError,
  Repository,
  defaultId,
  emptyDatabase,
  loadDatabase,
  type NewGameInput,
} from '../src/arena';
import { BOT_PRESETS } from '../src/bots';

const FOOL = ['f3', 'e5', 'g4', 'Qh4#'];
const SCHOLAR = ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'];

let repo: Repository;
let clock: number;
let seq: number;

function expectApiError(fn: () => unknown, status: number, message?: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).status).toBe(status);
    if (message) expect((e as ApiError).message).toContain(message);
    return;
  }
  throw new Error('expected ApiError');
}

beforeEach(() => {
  clock = 1_000;
  seq = 0;
  repo = new Repository(emptyDatabase(), { now: () => clock++, id: () => `id${++seq}` });
});

describe('database helpers', () => {
  it('loads or resets persisted data', () => {
    expect(loadDatabase(null)).toEqual(emptyDatabase());
    expect(loadDatabase({ version: 2 })).toEqual(emptyDatabase());
    expect(loadDatabase({ version: 1, players: [], games: 'x' })).toEqual(emptyDatabase());
    expect(loadDatabase({ version: 1, players: [], games: [] })).toEqual(emptyDatabase());
    expect(defaultId()).toMatch(/^[a-z0-9]{10,}$/);
    expect(new Repository().snapshot()).toEqual(emptyDatabase());
  });
});

describe('players', () => {
  it('creates humans and bots with sensible defaults', () => {
    const h = repo.createPlayer({ name: '  Magnus   C ', kind: 'human' });
    expect(h).toMatchObject({ id: 'id1', name: 'Magnus C', rating: 1200, ranked: true });
    expect(h.bot).toBeUndefined();
    const b = repo.createPlayer({ name: 'Robot', kind: 'bot', ranked: false });
    expect(b.bot).toEqual({ avatar: '🤖', description: '', config: expect.any(Object) });
    expect(b.ranked).toBe(false);
    const c = repo.createPlayer({
      name: 'Custom',
      kind: 'bot',
      bot: { avatar: '🦊', description: ' Rusé ', preset: 'x', config: { depth: 3 } },
    });
    expect(c.bot).toMatchObject({ avatar: '🦊', description: 'Rusé', preset: 'x' });
    expect(c.bot!.config.depth).toBe(3);
    expect(repo.listPlayers()).toHaveLength(3);
    expect(repo.listPlayers('bot')).toHaveLength(2);
  });

  it('validates names and kinds', () => {
    repo.createPlayer({ name: 'Alice', kind: 'human' });
    expectApiError(() => repo.createPlayer({ name: 'alice', kind: 'human' }), 409);
    expectApiError(() => repo.createPlayer({ name: 'A', kind: 'human' }), 400, 'entre 2 et 24');
    expectApiError(() => repo.createPlayer({ name: 42 as never, kind: 'human' }), 400);
    expectApiError(() => repo.createPlayer(null as never), 400);
    expectApiError(() => repo.createPlayer({ name: 'Bob', kind: 'alien' as never }), 400);
  });

  it('updates and deletes players', () => {
    const a = repo.createPlayer({ name: 'Alice', kind: 'human' });
    repo.createPlayer({ name: 'Bob', kind: 'human' });
    const bot = repo.createPlayer({ name: 'Bot', kind: 'bot', bot: { avatar: '🐙' } });
    expect(repo.updatePlayer(a.id, { name: 'Alicia', ranked: false })).toMatchObject({
      name: 'Alicia',
      ranked: false,
    });
    expect(repo.updatePlayer(a.id, { name: 'alicia' }).name).toBe('alicia');
    expect(repo.updatePlayer(a.id, {}).name).toBe('alicia');
    expectApiError(() => repo.updatePlayer(a.id, { name: 'bob' }), 409);
    expectApiError(() => repo.updatePlayer(a.id, { bot: {} }), 400);
    const updated = repo.updatePlayer(bot.id, { bot: { config: { depth: 4 } } });
    expect(updated.bot).toMatchObject({ avatar: '🐙', config: { depth: 4 } });
    expect(repo.updatePlayer(bot.id, { bot: {} }).bot!.config.depth).toBe(4);
    repo.deletePlayer(a.id);
    expectApiError(() => repo.getPlayer(a.id), 404);
    expectApiError(() => repo.deletePlayer('nope'), 404);
  });

  it('seeds preset bots once', () => {
    expect(repo.seedPresets()).toBe(BOT_PRESETS.length);
    expect(repo.seedPresets()).toBe(0);
    const gm = repo.listPlayers('bot').find((b) => b.bot?.preset === 'grand-maitre')!;
    expect(gm.rating).toBeGreaterThan(1200);
  });
});

describe('games', () => {
  let alice: string;
  let bob: string;
  let bot: string;
  let bot2: string;

  beforeEach(() => {
    alice = repo.createPlayer({ name: 'Alice', kind: 'human' }).id;
    bob = repo.createPlayer({ name: 'Bob', kind: 'human' }).id;
    bot = repo.createPlayer({ name: 'Bot', kind: 'bot' }).id;
    bot2 = repo.createPlayer({ name: 'Bot2', kind: 'bot', ranked: false }).id;
  });

  const game = (over: Partial<NewGameInput>): NewGameInput => ({
    whiteId: alice,
    blackId: bob,
    moves: SCHOLAR,
    result: '1-0',
    reason: 'checkmate',
    ...over,
  });

  it('records a rated checkmate and updates everything', () => {
    const g = repo.recordGame(game({ mode: 'pvp' }));
    expect(g).toMatchObject({ mode: 'pvp', rated: true, whiteDelta: 20, blackDelta: -20 });
    expect(g.pgn).toContain('[Termination "checkmate"]');
    const a = repo.getPlayer(alice);
    expect(a).toMatchObject({ rating: 1220, peak: 1220, wins: 1, streak: 1, recent: ['W'] });
    expect(a.asWhite.wins).toBe(1);
    const b = repo.getPlayer(bob);
    expect(b).toMatchObject({ rating: 1180, lowest: 1180, losses: 1, streak: -1 });
    expect(b.asBlack.losses).toBe(1);
    expect(repo.getGame(g.id)).toBe(g);
    expectApiError(() => repo.getGame('nope'), 404);
  });

  it('handles black wins, streaks, draws and resignations', () => {
    repo.recordGame(game({ moves: FOOL, result: '0-1' }));
    repo.recordGame(game({ moves: FOOL, result: '0-1' }));
    repo.recordGame(game({ moves: ['e4'], result: '0-1', reason: 'resignation' }));
    repo.recordGame(game({ moves: ['e4'], result: '1-0', reason: 'resignation' }));
    repo.recordGame(game({ moves: [], result: '1/2-1/2', reason: 'agreement' }));
    const b = repo.getPlayer(bob);
    expect(b).toMatchObject({ wins: 3, losses: 1, draws: 1, streak: 0, bestStreak: 3 });
    expect(b.recent).toEqual(['W', 'W', 'W', 'L', 'D']);
    expect(repo.getPlayer(alice).streak).toBe(0);
    const a = repo.getPlayer(alice);
    repo.recordGame(game({ moves: FOOL, result: '0-1' }));
    repo.recordGame(game({ moves: FOOL, result: '0-1' }));
    expect(a.streak).toBe(-2);
  });

  it('keeps unranked games unrated and infers modes', () => {
    const g = repo.recordGame(game({ whiteId: bot, blackId: bot2 }));
    expect(g).toMatchObject({ mode: 'eve', rated: false, whiteDelta: 0 });
    expect(repo.getPlayer(bot2).games).toBe(1);
    expect(repo.recordGame(game({ blackId: bot })).mode).toBe('pve');
    expect(repo.recordGame(game({ whiteId: bot, blackId: alice })).mode).toBe('pve');
  });

  it('caps recent results and history', () => {
    for (let i = 0; i < 105; i++) repo.recordGame(game({}));
    const a = repo.getPlayer(alice);
    expect(a.recent).toHaveLength(10);
    expect(a.history).toHaveLength(100);
  });

  it('rejects invalid games', () => {
    expectApiError(() => repo.recordGame(null as never), 404);
    expectApiError(() => repo.recordGame(game({ blackId: alice })), 400, 'lui-même');
    expectApiError(() => repo.recordGame(game({ result: '*' as never })), 400, 'Résultat');
    expectApiError(() => repo.recordGame(game({ reason: 'timeout' as never })), 400, 'Motif');
    expectApiError(() => repo.recordGame(game({ moves: 'e4' as never })), 400, 'coups');
    expectApiError(() => repo.recordGame(game({ mode: 'eve' })), 400, 'Mode');
    expectApiError(() => repo.recordGame(game({ moves: ['e4', 'e4'] })), 400, 'illégal');
    expectApiError(() => repo.recordGame(game({ result: '0-1' })), 400, 'position finale');
    expectApiError(() => repo.recordGame(game({ moves: ['e4'] })), 400, 'position finale');
    expectApiError(() => repo.recordGame(game({ reason: 'resignation' })), 400, 'déjà terminée');
    expectApiError(
      () => repo.recordGame(game({ moves: [], reason: 'resignation', result: '1/2-1/2' })),
      400,
      'motif',
    );
    expectApiError(
      () => repo.recordGame(game({ moves: [], reason: 'agreement', result: '1-0' })),
      400,
      'motif',
    );
  });

  it('lists games with filters and pagination', () => {
    repo.recordGame(game({}));
    repo.recordGame(game({ whiteId: bot, blackId: bob }));
    expect(repo.listGames()).toHaveLength(2);
    expect(repo.listGames({ playerId: alice })).toHaveLength(1);
    expect(repo.listGames({ limit: 1 })[0].whiteId).toBe(bot);
    expect(repo.listGames({ limit: 0, offset: -3 })).toHaveLength(1);
    expect(repo.listGames({ offset: 1 })[0].whiteId).toBe(alice);
  });

  it('builds a detailed leaderboard', () => {
    repo.recordGame(game({}));
    repo.recordGame(game({ whiteId: bot, blackId: bob, moves: SCHOLAR }));
    repo.recordGame(game({ whiteId: bot2, blackId: alice }));
    const board = repo.leaderboard();
    expect(board.map((r) => r.name)).toEqual(
      ['Bot', 'Alice', 'Bob'].sort((x, y) => {
        const r = (n: string) => repo.listPlayers().find((p) => p.name === n)!.rating;
        return r(y) - r(x);
      }),
    );
    expect(board[0].rank).toBe(1);
    expect(repo.leaderboard({ includeUnranked: true })).toHaveLength(4);
    expect(repo.leaderboard({ kind: 'human' }).every((r) => r.kind === 'human')).toBe(true);
    expect(repo.leaderboard({ kind: 'bot', includeUnranked: true })).toHaveLength(2);
    expect(repo.leaderboard({ minGames: 2 }).map((r) => r.name)).toEqual(['Alice', 'Bob']);
    expect(repo.leaderboard({ search: ' ali ' }).map((r) => r.name)).toEqual(['Alice']);
    const alicia = repo.leaderboard().find((r) => r.id === alice)!;
    expect(alicia).toMatchObject({ games: 2, wins: 1, losses: 1, winRate: 50, avatar: '🙂' });
    expect(alicia.form).toEqual(['W', 'L']);
    expect(alicia.performance).not.toBeNull();
    for (const sort of [
      'peak',
      'games',
      'wins',
      'winRate',
      'streak',
      'performance',
      'rating',
    ] as const) {
      const rows = repo.leaderboard({ sort, includeUnranked: true });
      expect(rows).toHaveLength(4);
    }
    const fresh = repo.createPlayer({ name: 'Newbie', kind: 'human' });
    const byPerf = repo.leaderboard({ sort: 'performance' });
    expect(byPerf[byPerf.length - 1].id).toBe(fresh.id);
    expect(byPerf[byPerf.length - 1].winRate).toBe(0);
  });

  it('builds player profiles with head-to-head', () => {
    repo.recordGame(game({}));
    repo.recordGame(game({ moves: FOOL, result: '0-1' }));
    repo.recordGame(
      game({ whiteId: bob, blackId: alice, moves: [], result: '1/2-1/2', reason: 'agreement' }),
    );
    repo.recordGame(game({ whiteId: bot, blackId: alice }));
    const p = repo.profile(alice);
    expect(p.rank).toBeGreaterThan(0);
    expect(p.headToHead[0]).toMatchObject({
      opponentName: 'Bob',
      games: 3,
      wins: 1,
      losses: 1,
      draws: 1,
    });
    expect(p.headToHead[1]).toMatchObject({ opponentName: 'Bot', losses: 1 });
    expect(p.recentGames).toHaveLength(4);
    expect(repo.profile(bot2).rank).toBeNull();
  });

  it('computes global stats', () => {
    expect(repo.stats()).toMatchObject({ games: 0, averageLength: 0 });
    repo.recordGame(game({}));
    repo.recordGame(game({ moves: FOOL, result: '0-1' }));
    repo.recordGame(game({ moves: [], result: '1/2-1/2', reason: 'agreement' }));
    expect(repo.stats()).toEqual({
      players: 4,
      humans: 2,
      bots: 2,
      games: 3,
      whiteWins: 1,
      blackWins: 1,
      draws: 1,
      averageLength: 4,
      reasons: { checkmate: 2, agreement: 1 },
    });
  });
});
