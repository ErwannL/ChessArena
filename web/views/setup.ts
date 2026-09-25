import type { PlayerRecord } from '../../src/arena/types';
import { GameSession, type Seat } from '../../src/client/session';
import { clear, errorMessage, h, loading, toast } from '../dom';
import { glyph } from '../pieces';
import { loadPrefs, savePrefs, state } from '../state';

type Mode = 'pvp' | 'pve' | 'eve';
const GUEST = '__guest';
const NEW = '__new';

export function seatFromPlayer(p: PlayerRecord): Seat {
  return {
    kind: p.kind,
    playerId: p.id,
    name: p.name,
    avatar: p.bot?.avatar ?? '🙂',
    rating: p.rating,
    bot: p.bot?.config,
  };
}

const guestSeat = (name: string): Seat => ({ kind: 'human', playerId: null, name, avatar: '👤' });

export function startSession(white: Seat, black: Seat): void {
  state.session = new GameSession(white, black);
  location.hash = '#/play';
}

export async function setupView(el: HTMLElement, params: string[]): Promise<void> {
  const mode = (['pvp', 'pve', 'eve'].includes(params[0]) ? params[0] : 'pve') as Mode;
  clear(el, loading());
  let players = await state.api.players();
  const prefs = loadPrefs();

  const humans = () => players.filter((p) => p.kind === 'human');
  const bots = () => players.filter((p) => p.kind === 'bot');

  function picker(kind: 'human' | 'bot', prefKey: string, fallbackIndex: number) {
    const select = h('select', {
      'aria-label': kind === 'bot' ? 'Choisir un bot' : 'Choisir un joueur',
    });
    const newName = h('input', {
      type: 'text',
      placeholder: 'Nom du nouveau joueur',
      maxlength: 24,
    });
    const createRow = h(
      'div',
      { class: 'row', hidden: true },
      newName,
      h(
        'button',
        {
          class: 'btn small',
          onclick: async () => {
            try {
              const p = await state.api.createPlayer({ name: newName.value, kind: 'human' });
              players = await state.api.players();
              fill(p.id);
              refreshAll();
              toast(`Joueur « ${p.name} » créé`);
            } catch (e) {
              toast(errorMessage(e), 'error');
            }
          },
        },
        'Créer',
      ),
    );
    const fill = (selected?: string) => {
      const list = kind === 'bot' ? bots() : humans();
      const wanted =
        selected ?? prefs[prefKey] ?? list[Math.min(fallbackIndex, list.length - 1)]?.id ?? GUEST;
      clear(
        select,
        kind === 'human' ? h('option', { value: GUEST }, '👤 Invité (partie non classée)') : null,
        list.map((p) =>
          h(
            'option',
            { value: p.id },
            `${p.bot?.avatar ?? '🙂'} ${p.name} — ${p.rating}${p.ranked ? '' : ' (non classé)'}`,
          ),
        ),
        kind === 'human' ? h('option', { value: NEW }, '➕ Nouveau joueur…') : null,
      );
      select.value = [...select.options].some((o) => o.value === wanted)
        ? wanted
        : (select.options[0]?.value ?? '');
      createRow.hidden = select.value !== NEW;
    };
    select.addEventListener('change', () => {
      createRow.hidden = select.value !== NEW;
      if (select.value === NEW) newName.focus();
      refreshAll();
    });
    fill();
    const seat = (label: string): Seat | null => {
      if (select.value === NEW) return null;
      if (select.value === GUEST || !select.value) return guestSeat(label);
      return seatFromPlayer(players.find((p) => p.id === select.value)!);
    };
    return { el: h('div', { class: 'stack' }, select, createRow), select, seat, prefKey };
  }

  const info = h('p', { class: 'small muted' });
  let refreshAll = () => {};

  const tabs = h(
    'div',
    { class: 'tabs', role: 'tablist' },
    (
      [
        ['pvp', '🤝 Joueur vs Joueur'],
        ['pve', '🧑‍💻 Joueur vs Bot'],
        ['eve', '🤖 Bot vs Bot'],
      ] as const
    ).map(([m, label]) =>
      h(
        'button',
        {
          class: m === mode ? 'active' : '',
          role: 'tab',
          onclick: () => (location.hash = `#/new/${m}`),
        },
        label,
      ),
    ),
  );

  const seatCard = (title: string, color: 'w' | 'b' | null, content: HTMLElement) =>
    h(
      'div',
      { class: 'card seat' },
      h(
        'div',
        { class: 'title' },
        color ? h('span', { class: `piece-icon piece ${color}` }, glyph('k')) : null,
        title,
      ),
      content,
    );

  let body: HTMLElement;
  let start: () => void;

  if (mode === 'pvp') {
    const white = picker('human', 'pvp-white', 0);
    const black = picker('human', 'pvp-black', 1);
    body = h(
      'div',
      { class: 'grid grid-2' },
      seatCard('Blancs', 'w', white.el),
      seatCard('Noirs', 'b', black.el),
    );
    refreshAll = () => {
      const w = white.seat('Invité Blancs');
      const b = black.seat('Invité Noirs');
      info.textContent =
        w?.playerId && b?.playerId && w.playerId === b.playerId
          ? '⚠️ Choisissez deux joueurs différents.'
          : w?.playerId && b?.playerId
            ? '✅ Partie classée : le résultat comptera dans le classement Elo.'
            : 'ℹ️ Partie amicale : les invités ne sont pas classés (annulation de coup autorisée).';
    };
    start = () => {
      const w = white.seat('Invité Blancs');
      const b = black.seat('Invité Noirs');
      if (!w || !b) return toast('Créez d’abord le nouveau joueur', 'error');
      if (w.playerId && w.playerId === b.playerId)
        return toast('Choisissez deux joueurs différents', 'error');
      savePrefs({ 'pvp-white': white.select.value, 'pvp-black': black.select.value });
      startSession(w, b);
    };
  } else if (mode === 'pve') {
    const human = picker('human', 'pve-human', 0);
    const bot = picker('bot', 'pve-bot', 4);
    const color = h(
      'select',
      { 'aria-label': 'Couleur' },
      h('option', { value: 'w' }, '♔ Je joue les Blancs'),
      h('option', { value: 'b' }, '♚ Je joue les Noirs'),
      h('option', { value: 'r' }, '🎲 Couleur aléatoire'),
    );
    color.value = prefs['pve-color'] ?? 'w';
    body = h(
      'div',
      { class: 'grid grid-2' },
      seatCard(
        'Vous',
        null,
        h(
          'div',
          { class: 'stack' },
          human.el,
          h('div', { class: 'field' }, h('label', null, 'Couleur'), color),
        ),
      ),
      seatCard(
        'Votre adversaire',
        null,
        h(
          'div',
          { class: 'stack' },
          bot.el,
          h('a', { href: '#/bots/new', class: 'small' }, '➕ Créer un bot sur mesure'),
        ),
      ),
    );
    refreshAll = () => {
      info.textContent = human.seat('Invité')?.playerId
        ? '✅ Partie classée contre le bot (si le bot est classé).'
        : 'ℹ️ Partie amicale en tant qu’invité : annulation de coup autorisée.';
    };
    start = () => {
      const me = human.seat('Invité');
      const b = bot.seat('Bot');
      if (!me) return toast('Créez d’abord le nouveau joueur', 'error');
      if (!b?.bot) return toast('Aucun bot disponible — créez-en un !', 'error');
      savePrefs({
        'pve-human': human.select.value,
        'pve-bot': bot.select.value,
        'pve-color': color.value,
      });
      const white = color.value === 'w' || (color.value === 'r' && Math.random() < 0.5);
      startSession(white ? me : b, white ? b : me);
    };
  } else {
    const white = picker('bot', 'eve-white', 5);
    const black = picker('bot', 'eve-black', 6);
    const games = h(
      'select',
      { 'aria-label': 'Nombre de parties' },
      [1, 2, 4, 6, 10, 20].map((n) =>
        h(
          'option',
          { value: n },
          n === 1 ? '1 partie' : `Série de ${n} parties (couleurs alternées)`,
        ),
      ),
    );
    games.value = prefs['eve-games'] ?? '1';
    const speed = h('input', {
      type: 'range',
      min: 0,
      max: 2000,
      step: 100,
      value: String(state.eveDelay),
    });
    speed.addEventListener('input', () => (state.eveDelay = Number(speed.value)));
    body = h(
      'div',
      { class: 'stack' },
      h(
        'div',
        { class: 'grid grid-2' },
        seatCard('Bot Blancs', 'w', white.el),
        seatCard('Bot Noirs', 'b', black.el),
      ),
      h(
        'div',
        { class: 'card grid grid-2' },
        h('div', { class: 'field' }, h('label', null, 'Format'), games),
        h('div', { class: 'field' }, h('label', null, 'Pause entre les coups'), speed),
      ),
    );
    refreshAll = () => {
      info.textContent = 'ℹ️ Les parties entre bots classés comptent dans le classement.';
    };
    start = () => {
      const w = white.seat('Bot');
      const b = black.seat('Bot');
      if (!w?.playerId || !b?.playerId) return toast('Il faut deux bots', 'error');
      if (w.playerId === b.playerId) return toast('Choisissez deux bots différents', 'error');
      savePrefs({
        'eve-white': white.select.value,
        'eve-black': black.select.value,
        'eve-games': games.value,
      });
      const total = Number(games.value);
      state.series =
        total > 1 ? { total, played: 0, points: { [w.playerId]: 0, [b.playerId]: 0 } } : null;
      startSession(w, b);
    };
  }

  refreshAll();
  clear(
    el,
    h('h1', null, 'Nouvelle partie'),
    tabs,
    h('div', { style: 'height:1rem' }),
    body,
    h('div', { style: 'height:1rem' }),
    h(
      'div',
      { class: 'row' },
      info,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn primary', onclick: () => start() }, '▶ Lancer la partie'),
    ),
  );
}
