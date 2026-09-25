import { think, type ThinkRequest } from './thinker';

self.onmessage = (e: MessageEvent<ThinkRequest>) => {
  self.postMessage(think(e.data));
};
