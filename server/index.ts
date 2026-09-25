import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Repository } from '../src/arena/repository';
import { createApp } from './app';
import { readDatabase, writeDatabase } from './store';

const port = Number(process.env.PORT ?? 3000);
const dataFile = resolve(
  process.env.DATA_FILE ?? join(process.env.DATA_DIR ?? 'data', 'arena.json'),
);
const here = fileURLToPath(new URL('.', import.meta.url));
const staticDir = resolve(process.env.STATIC_DIR ?? join(here, '..', 'web'));

const repo = new Repository(readDatabase(dataFile));
const seeded = repo.seedPresets();
const persist = () => writeDatabase(dataFile, repo.snapshot());
if (seeded) persist();

const server = createServer(
  createApp({ repo, onChange: persist, staticDir, version: process.env.APP_VERSION ?? '1.0.0' }),
);
server.listen(port, () => {
  console.log(`♞ ChessArena prêt sur http://localhost:${port} (données : ${dataFile})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
