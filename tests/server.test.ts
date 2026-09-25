import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Repository } from '../src/arena';
import { createApp } from '../server/app';
import { readDatabase, writeDatabase } from '../server/store';

let dir: string;
let server: Server;
let base: string;
let repo: Repository;
const onChange = vi.fn();

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(base + path, {
    ...init,
    headers: { 'content-type': 'application/json' },
  });
  const text = await res.text();
  const json = res.headers.get('content-type')?.includes('json');
  return { status: res.status, headers: res.headers, body: json ? JSON.parse(text) : null, text };
}

function listen(handler: ReturnType<typeof createApp>): Promise<[Server, string]> {
  return new Promise((ok) => {
    const s = createServer(handler);
    s.listen(0, () => ok([s, `http://127.0.0.1:${(s.address() as AddressInfo).port}`]));
  });
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'arena-'));
  const web = join(dir, 'web');
  mkdirSync(join(web, 'assets'), { recursive: true });
  writeFileSync(join(web, 'index.html'), '<h1>ChessArena</h1>');
  writeFileSync(join(web, 'assets', 'app.js'), 'console.log(1)');
  writeFileSync(join(web, 'logo.weird'), 'x');
  writeFileSync(join(dir, 'secret.txt'), 'nope');
  repo = new Repository();
  repo.seedPresets();
  [server, base] = await listen(createApp({ repo, onChange, staticDir: web, version: '9.9.9' }));
});

afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('API', () => {
  it('reports health, stats, heuristics and presets', async () => {
    expect((await api('/api/health')).body).toEqual({ status: 'ok', version: '9.9.9' });
    expect((await api('/api/stats')).body.bots).toBe(7);
    const h = await api('/api/heuristics');
    expect(h.body[0]).toEqual({
      id: 'material',
      name: expect.any(String),
      icon: expect.any(String),
      description: expect.any(String),
    });
    expect((await api('/api/presets')).body).toHaveLength(7);
  });

  it('manages players', async () => {
    const created = await api('/api/players', {
      method: 'POST',
      body: JSON.stringify({ name: 'Erwann', kind: 'human' }),
    });
    expect(created.status).toBe(201);
    expect(onChange).toHaveBeenCalled();
    const id = created.body.id;
    expect((await api('/api/players?kind=human')).body).toHaveLength(1);
    expect((await api('/api/players?kind=zzz')).body).toHaveLength(8);
    expect((await api('/api/players')).body).toHaveLength(8);
    expect((await api(`/api/players/${id}`)).body.player.name).toBe('Erwann');
    const patched = await api(`/api/players/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ranked: false }),
    });
    expect(patched.body.ranked).toBe(false);
    const dup = await api('/api/players', {
      method: 'POST',
      body: JSON.stringify({ name: 'erwann', kind: 'human' }),
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toContain('déjà pris');
    expect((await api(`/api/players/${id}`, { method: 'DELETE' })).body).toEqual({ deleted: id });
    expect((await api(`/api/players/${id}`)).status).toBe(404);
  });

  it('records games and exposes leaderboard and history', async () => {
    const [a, b] = await Promise.all(
      ['Alice', 'Bob'].map(
        async (name) =>
          (
            await api('/api/players', {
              method: 'POST',
              body: JSON.stringify({ name, kind: 'human' }),
            })
          ).body.id,
      ),
    );
    const game = await api('/api/games', {
      method: 'POST',
      body: JSON.stringify({
        whiteId: a,
        blackId: b,
        moves: ['f3', 'e5', 'g4', 'Qh4#'],
        result: '0-1',
        reason: 'checkmate',
      }),
    });
    expect(game.status).toBe(201);
    expect((await api(`/api/games/${game.body.id}`)).body.moves).toHaveLength(4);
    expect((await api(`/api/games?playerId=${a}&limit=5&offset=0`)).body).toHaveLength(1);
    expect((await api('/api/games')).body.length).toBeGreaterThan(0);
    const lb = await api('/api/leaderboard?kind=human&minGames=1&sort=rating&search=b');
    expect(lb.body.map((r: { name: string }) => r.name)).toEqual(['Bob']);
    expect((await api('/api/leaderboard?includeUnranked=true')).body.length).toBeGreaterThan(8);
    expect((await api('/api/leaderboard?minGames=abc')).status).toBe(200);
  });

  it('returns proper errors', async () => {
    expect((await api('/api/nope')).status).toBe(404);
    expect((await api('/api/players', { method: 'PUT' })).status).toBe(405);
    const bad = await api('/api/players', { method: 'POST', body: '{oops' });
    expect(bad).toMatchObject({ status: 400, body: { error: 'JSON invalide' } });
    const empty = await api('/api/players', { method: 'POST' });
    expect(empty.status).toBe(400);
    const big = await api('/api/players', { method: 'POST', body: 'x'.repeat(1_100_000) }).catch(
      () => ({ status: 413 }),
    );
    expect(big.status).toBe(413);
  });

  it('hides unexpected errors', async () => {
    const broken = new Repository();
    broken.stats = () => {
      throw new Error('boom');
    };
    const [s, url] = await listen(createApp({ repo: broken }));
    const res = await fetch(`${url}/api/stats`);
    expect(res.status).toBe(500);
    expect((await fetch(`${url}/api/health`).then((r) => r.json())).version).toBe('dev');
    expect((await fetch(`${url}/`)).status).toBe(404);
    s.close();
  });
});

describe('static files', () => {
  it('serves the SPA with caching headers', async () => {
    const index = await api('/');
    expect(index.text).toContain('ChessArena');
    expect(index.headers.get('cache-control')).toBe('no-cache');
    const asset = await api('/assets/app.js');
    expect(asset.headers.get('content-type')).toContain('javascript');
    expect(asset.headers.get('cache-control')).toContain('immutable');
    expect((await api('/logo.weird')).headers.get('content-type')).toBe('application/octet-stream');
    expect((await api('/leaderboard/deep/link')).text).toContain('ChessArena');
    expect((await api('/', { method: 'POST' })).status).toBe(405);
  });

  it('prevents path traversal', async () => {
    const text = await new Promise<string>((ok) => {
      const req = request(`${base}/..%2f..%2fsecret.txt`, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => ok(data));
      });
      req.path = '/../secret.txt';
      req.end();
    });
    expect(text).not.toContain('nope');
  });

  it('404s when the build is missing', async () => {
    const [s, url] = await listen(createApp({ repo, staticDir: join(dir, 'missing') }));
    expect((await fetch(url)).status).toBe(404);
    s.close();
  });

  it('handles requests without url', async () => {
    const handler = createApp({ repo, staticDir: join(dir, 'web') });
    const res = { writeHead: vi.fn(), end: vi.fn() };
    await handler({ method: 'GET' } as never, res as never);
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
  });
});

describe('store', () => {
  it('persists atomically and recovers from bad files', () => {
    const file = join(dir, 'nested', 'db.json');
    expect(readDatabase(file).players).toEqual([]);
    const r = new Repository();
    r.createPlayer({ name: 'Zoé', kind: 'human' });
    writeDatabase(file, r.snapshot());
    expect(readDatabase(file).players[0].name).toBe('Zoé');
    expect(JSON.parse(readFileSync(file, 'utf8')).version).toBe(1);
    writeFileSync(file, 'not json');
    expect(readDatabase(file).players).toEqual([]);
  });
});
