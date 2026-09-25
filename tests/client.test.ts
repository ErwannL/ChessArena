import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ApiError, Repository } from '../src/arena';
import { DEFAULT_CONFIG } from '../src/bots';
import {
  GameSession,
  HttpApi,
  LocalApi,
  connectApi,
  formatEval,
  percent,
  relativeTime,
  resultLabel,
  signed,
  type ArenaApi,
  type Seat,
} from '../src/client';
import { createApp } from '../server/app';

class MemoryStorage {
  data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
}

let server: Server;
let base: string;

beforeAll(async () => {
  const repo = new Repository();
  repo.seedPresets();
  server = createServer(createApp({ repo }));
  await new Promise<void>((ok) => server.listen(0, ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => void server.close());

async function exercise(api: ArenaApi) {
  expect((await api.presets()).length).toBe(7);
  expect((await api.heuristics())[0].id).toBe('material');
  const a = await api.createPlayer({ name: 'Alice', kind: 'human' });
  const b = await api.createPlayer({ name: 'Bob', kind: 'human' });
  expect((await api.players('human')).map((p) => p.name)).toEqual(['Alice', 'Bob']);
  expect((await api.players()).length).toBe(9);
  expect((await api.updatePlayer(a.id, { name: 'Alicia' })).name).toBe('Alicia');
  const g = await api.recordGame({
    whiteId: a.id,
    blackId: b.id,
    moves: ['f3', 'e5', 'g4', 'Qh4#'],
    result: '0-1',
    reason: 'checkmate',
  });
  expect((await api.game(g.id)).moves).toHaveLength(4);
  expect(await api.games({ playerId: a.id })).toHaveLength(1);
  expect(await api.games()).toHaveLength(1);
  expect((await api.leaderboard({ kind: 'human' }))[0].name).toBe('Bob');
  expect((await api.leaderboard()).length).toBe(9);
  expect((await api.profile(b.id)).player.wins).toBe(1);
  expect((await api.stats()).games).toBe(1);
  await api.deletePlayer(b.id);
  await expect(api.profile(b.id)).rejects.toBeInstanceOf(ApiError);
}

describe('HttpApi', () => {
  it('talks to the server', async () => {
    const api = new HttpApi((url, init) => fetch(url, init), base);
    expect(api.mode).toBe('server');
    await exercise(api);
  });

  it('reports errors without JSON body', async () => {
    const api = new HttpApi(async () => new Response('oops', { status: 502 }));
    await expect(api.stats()).rejects.toMatchObject({ status: 502, message: 'Erreur 502' });
  });
});

describe('LocalApi', () => {
  it('works offline and persists to storage', async () => {
    const storage = new MemoryStorage();
    const api = new LocalApi(storage);
    expect(api.mode).toBe('local');
    await exercise(api);
    const reloaded = new LocalApi(storage);
    expect((await reloaded.stats()).games).toBe(1);
    expect(storage.data.size).toBe(1);
  });

  it('recovers from corrupted storage', async () => {
    const storage = new MemoryStorage();
    storage.setItem('chessarena:db', '{broken');
    expect((await new LocalApi(storage).players('bot')).length).toBe(7);
  });

  it('does not rewrite storage when already seeded', () => {
    const storage = new MemoryStorage();
    new LocalApi(storage);
    const spy = vi.spyOn(storage, 'setItem');
    new LocalApi(storage);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('connectApi', () => {
  it('picks the server when healthy', async () => {
    const api = await connectApi((url, init) => fetch(base + url, init), new MemoryStorage());
    expect(api.mode).toBe('server');
  });

  it('falls back to local mode', async () => {
    const storage = new MemoryStorage();
    const down = await connectApi(async () => new Response('{}', { status: 200 }), storage);
    expect(down.mode).toBe('local');
    const failing = await connectApi(async () => Promise.reject(new Error('net')), storage);
    expect(failing.mode).toBe('local');
    const slow = await connectApi(() => new Promise(() => {}), storage, 5);
    expect(slow.mode).toBe('local');
  });
});

describe('GameSession', () => {
  const human = (id: string | null, name = 'H'): Seat => ({
    kind: 'human',
    playerId: id,
    name,
    avatar: '🙂',
  });
  const bot = (id: string | null): Seat => ({
    kind: 'bot',
    playerId: id,
    name: 'B',
    avatar: '🤖',
    bot: DEFAULT_CONFIG,
  });

  it('knows modes, seats and turns', () => {
    expect(new GameSession(human('a'), human('b')).mode).toBe('pvp');
    expect(new GameSession(bot('a'), bot('b')).mode).toBe('eve');
    const s = new GameSession(human('a'), bot('b'));
    expect(s.mode).toBe('pve');
    expect(s.seat('b').kind).toBe('bot');
    expect(s.toMove).toBe(s.white);
    expect(s.isBotTurn()).toBe(false);
    s.game.move('e4');
    expect(s.isBotTurn()).toBe(true);
  });

  it('only allows undo in casual games and undoes bot replies', () => {
    const rated = new GameSession(human('a'), human('b'));
    rated.game.move('e4');
    expect(rated.canUndo()).toBe(false);
    rated.undo();
    expect(rated.game.history()).toHaveLength(1);

    const casual = new GameSession(human(null), bot('b'));
    expect(casual.canUndo()).toBe(false);
    casual.game.move('e4');
    casual.game.move('e5');
    casual.undo();
    expect(casual.game.history()).toHaveLength(0);

    const pvp = new GameSession(human(null), human(null));
    pvp.game.move('e4');
    pvp.game.move('e5');
    pvp.undo();
    expect(pvp.game.history()).toHaveLength(1);

    const eve = new GameSession(bot(null), bot(null));
    eve.game.move('e4');
    expect(eve.canUndo()).toBe(false);

    const botWhite = new GameSession(bot(null), human(null));
    botWhite.game.move('e4');
    botWhite.undo();
    expect(botWhite.game.history()).toHaveLength(0);
  });

  it('builds the result payload once the game is over', () => {
    const s = new GameSession(human('a'), human('b'));
    expect(s.resultPayload()).toBeNull();
    for (const m of ['f3', 'e5', 'g4', 'Qh4#']) s.game.move(m);
    expect(s.isBotTurn()).toBe(false);
    expect(s.resultPayload()).toEqual({
      whiteId: 'a',
      blackId: 'b',
      moves: ['f3', 'e5', 'g4', 'Qh4#'],
      result: '0-1',
      reason: 'checkmate',
      mode: 'pvp',
    });
    s.recorded = true;
    expect(s.resultPayload()).toBeNull();
    const guest = new GameSession(human(null), human('b'));
    guest.game.resign('w');
    expect(guest.resultPayload()).toBeNull();
  });
});

describe('format helpers', () => {
  it('formats results and numbers', () => {
    expect(resultLabel('1-0', 'A', 'B')).toBe('A gagne');
    expect(resultLabel('0-1', 'A', 'B')).toBe('B gagne');
    expect(resultLabel('1/2-1/2', 'A', 'B')).toBe('Partie nulle');
    expect(resultLabel('*', 'A', 'B')).toBe('En cours');
    expect(signed(5)).toBe('+5');
    expect(signed(-5)).toBe('-5');
    expect(signed(0)).toBe('0');
    expect(formatEval(125)).toBe('+1.25');
    expect(formatEval(99_999)).toBe('#1');
    expect(formatEval(-99_996)).toBe('-#2');
    expect(percent(1, 3)).toBe('33%');
    expect(percent(0, 0)).toBe('–');
  });

  it('formats relative times', () => {
    const now = 10_000_000_000;
    expect(relativeTime(null, now)).toBe('jamais');
    expect(relativeTime(now - 5_000, now)).toBe('à l’instant');
    expect(relativeTime(now - 5 * 60_000, now)).toBe('il y a 5 min');
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('il y a 3 h');
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe('il y a 2 j');
    expect(relativeTime(now - 90 * 86_400_000, now)).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(relativeTime(Date.now() - 1000)).toBe('à l’instant');
  });
});
