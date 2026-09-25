import type { BotConfig } from '../src/bots/config';
import { think, type ThinkResult } from './thinker';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (r: ThinkResult) => void>();

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<ThinkResult>) => {
      pending.get(e.data.id)?.(e.data);
      pending.delete(e.data.id);
    };
    return worker;
  } catch {
    return null;
  }
}

/** Runs the bot's reasoning off the main thread (falls back to the main thread if needed). */
export function botThink(fen: string, config: BotConfig, seen: string[]): Promise<ThinkResult> {
  const id = nextId++;
  const w = getWorker();
  if (!w) return new Promise((ok) => setTimeout(() => ok(think({ id, fen, config, seen })), 10));
  return new Promise((ok) => {
    pending.set(id, ok);
    w.postMessage({ id, fen, config, seen });
  });
}

/** Stops any ongoing reflection (e.g. when leaving the game screen). */
export function cancelThinking(): void {
  pending.clear();
  worker?.terminate();
  worker = null;
}
