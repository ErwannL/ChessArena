import { existsSync, readFileSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { ApiError, type Repository } from '../src/arena/repository';
import type { LeaderboardQuery } from '../src/arena/types';
import { HEURISTICS } from '../src/bots/heuristics';
import { BOT_PRESETS } from '../src/bots/presets';

export interface AppOptions {
  repo: Repository;
  /** Called after every successful mutation (persist to disk…). */
  onChange?: () => void;
  /** Directory of the built web client, served with SPA fallback. */
  staticDir?: string;
  version?: string;
}

const MAX_BODY = 1_000_000;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

type Handler = (ctx: {
  params: string[];
  query: URLSearchParams;
  body: () => Promise<unknown>;
}) => unknown;

interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
  mutates?: boolean;
}

function send(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new ApiError(413, 'Requête trop volumineuse'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolveBody({});
      try {
        resolveBody(JSON.parse(text));
      } catch {
        reject(new ApiError(400, 'JSON invalide'));
      }
    });
  });
}

const int = (v: string | null): number | undefined => (v === null ? undefined : Number(v) || 0);

export function createApp(options: AppOptions) {
  const { repo, onChange, staticDir, version = 'dev' } = options;

  const routes: Route[] = [
    { method: 'GET', pattern: /^\/api\/health$/, handler: () => ({ status: 'ok', version }) },
    { method: 'GET', pattern: /^\/api\/stats$/, handler: () => repo.stats() },
    {
      method: 'GET',
      pattern: /^\/api\/heuristics$/,
      handler: () =>
        HEURISTICS.map(({ id, name, icon, description }) => ({ id, name, icon, description })),
    },
    { method: 'GET', pattern: /^\/api\/presets$/, handler: () => BOT_PRESETS },
    {
      method: 'GET',
      pattern: /^\/api\/players$/,
      handler: ({ query }) => {
        const kind = query.get('kind');
        return repo.listPlayers(kind === 'human' || kind === 'bot' ? kind : undefined);
      },
    },
    {
      method: 'POST',
      pattern: /^\/api\/players$/,
      mutates: true,
      handler: async ({ body }) => repo.createPlayer((await body()) as never),
    },
    {
      method: 'GET',
      pattern: /^\/api\/players\/([^/]+)$/,
      handler: ({ params }) => repo.profile(params[0]),
    },
    {
      method: 'PATCH',
      pattern: /^\/api\/players\/([^/]+)$/,
      mutates: true,
      handler: async ({ params, body }) => repo.updatePlayer(params[0], (await body()) as never),
    },
    {
      method: 'DELETE',
      pattern: /^\/api\/players\/([^/]+)$/,
      mutates: true,
      handler: ({ params }) => {
        repo.deletePlayer(params[0]);
        return { deleted: params[0] };
      },
    },
    {
      method: 'GET',
      pattern: /^\/api\/leaderboard$/,
      handler: ({ query }) =>
        repo.leaderboard({
          kind: (query.get('kind') ?? undefined) as LeaderboardQuery['kind'],
          includeUnranked: query.get('includeUnranked') === 'true',
          minGames: int(query.get('minGames')),
          sort: (query.get('sort') ?? undefined) as LeaderboardQuery['sort'],
          search: query.get('search') ?? undefined,
        }),
    },
    {
      method: 'GET',
      pattern: /^\/api\/games$/,
      handler: ({ query }) =>
        repo.listGames({
          playerId: query.get('playerId') ?? undefined,
          limit: int(query.get('limit')),
          offset: int(query.get('offset')),
        }),
    },
    {
      method: 'GET',
      pattern: /^\/api\/games\/([^/]+)$/,
      handler: ({ params }) => repo.getGame(params[0]),
    },
    {
      method: 'POST',
      pattern: /^\/api\/games$/,
      mutates: true,
      handler: async ({ body }) => repo.recordGame((await body()) as never),
    },
  ];

  async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const matching = routes.filter((r) => r.pattern.test(url.pathname));
    const route = matching.find((r) => r.method === req.method);
    if (!route) {
      send(res, matching.length ? 405 : 404, {
        error: matching.length ? 'Méthode non autorisée' : 'Route inconnue',
      });
      return;
    }
    const params = route.pattern.exec(url.pathname)!.slice(1).map(decodeURIComponent);
    try {
      const data = await route.handler({
        params,
        query: url.searchParams,
        body: () => readBody(req),
      });
      if (route.mutates) onChange?.();
      send(res, req.method === 'POST' ? 201 : 200, data);
    } catch (error) {
      if (error instanceof ApiError) {
        send(res, error.status, { error: error.message });
      } else {
        send(res, 500, { error: 'Erreur interne' });
      }
    }
  }

  function serveStatic(res: ServerResponse, pathname: string): void {
    if (!staticDir) {
      send(res, 404, { error: 'Not found' });
      return;
    }
    const root = resolve(staticDir);
    const target = resolve(join(root, normalize(decodeURIComponent(pathname))));
    const inside = target === root || target.startsWith(root + sep);
    const file =
      inside && existsSync(target) && statSync(target).isFile() ? target : join(root, 'index.html');
    if (!existsSync(file)) {
      send(res, 404, { error: 'Not found' });
      return;
    }
    const immutable = file.includes(`${sep}assets${sep}`);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    res.end(readFileSync(file));
  }

  return async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      serveStatic(res, url.pathname);
    } else {
      send(res, 405, { error: 'Méthode non autorisée' });
    }
  };
}
