import { connectApi } from '../src/client/api';
import { clear, errorMessage, h } from './dom';
import { state } from './state';
import { botEditorView, botsView } from './views/bots';
import { gamesView, replayView } from './views/games';
import { homeView } from './views/home';
import { leaderboardView } from './views/leaderboard';
import { playView } from './views/play';
import { profileView } from './views/profile';
import { setupView } from './views/setup';

type View = (el: HTMLElement, params: string[]) => void | (() => void) | Promise<void>;

const routes: [RegExp, string, View][] = [
  [/^$/, 'home', homeView],
  [/^new\/?(\w*)$/, 'new', setupView],
  [/^play$/, 'new', playView],
  [/^leaderboard$/, 'leaderboard', leaderboardView],
  [/^bots$/, 'bots', botsView],
  [/^bots\/new$/, 'bots', botEditorView],
  [/^bots\/edit\/([^/]+)$/, 'bots', botEditorView],
  [/^player\/([^/]+)$/, 'leaderboard', profileView],
  [/^games$/, 'games', gamesView],
  [/^game\/([^/]+)$/, 'games', replayView],
];

const app = document.getElementById('app')!;
let cleanup: (() => void) | null = null;

async function route(): Promise<void> {
  cleanup?.();
  cleanup = null;
  const path = location.hash.replace(/^#\/?/, '').split('?')[0];
  const match = routes.find(([re]) => re.test(path));
  if (!match) {
    location.hash = '#/';
    return;
  }
  const [re, nav, view] = match;
  document
    .querySelectorAll<HTMLAnchorElement>('#nav a')
    .forEach((a) => a.classList.toggle('active', a.dataset.route === nav));
  window.scrollTo(0, 0);
  try {
    const result = await view(app, re.exec(path)!.slice(1).map(decodeURIComponent));
    if (typeof result === 'function') cleanup = result;
  } catch (e) {
    clear(app, h('div', { class: 'card empty' }, `Erreur : ${errorMessage(e)}`));
  }
}

async function boot(): Promise<void> {
  clear(app, h('div', { class: 'loading' }, 'Connexion à l’arène…'));
  state.api = await connectApi((url, init) => fetch(url, init), localStorage);
  state.heuristics = await state.api.heuristics();
  const badge = document.getElementById('mode-badge')!;
  badge.hidden = false;
  badge.textContent = state.api.mode === 'server' ? '🟢 En ligne' : '💾 Hors-ligne';
  badge.title =
    state.api.mode === 'server'
      ? 'Classement partagé via le serveur'
      : 'Serveur indisponible : données enregistrées dans ce navigateur';
  window.addEventListener('hashchange', route);
  await route();
}

boot();
