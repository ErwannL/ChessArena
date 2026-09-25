import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadDatabase } from '../src/arena/repository';
import type { Database } from '../src/arena/types';

/** Reads the JSON database file, or returns an empty database when missing/corrupted. */
export function readDatabase(file: string): Database {
  if (!existsSync(file)) return loadDatabase(null);
  try {
    return loadDatabase(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return loadDatabase(null);
  }
}

/** Atomically writes the database (temp file + rename). */
export function writeDatabase(file: string, db: Database): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(db));
  renameSync(tmp, file);
}
