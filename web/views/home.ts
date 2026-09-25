import { h, clear, loading } from '../dom';
import { state } from '../state';
import { resultLabel, REASON_LABELS, relativeTime } from '../../src/client/format';
import { formRow, playerLink } from './shared';

export async function homeView(el: HTMLElement): Promise<void> {
  const modes = [
    {
      mode: 'pvp',
      icon: '🤝',
      title: 'Joueur vs Joueur',
      text: 'Affrontez un ami sur le même appareil — PC, tablette ou téléphone.',
    },
    {
      mode: 'pve',
      icon: '🧑‍💻',
      title: 'Joueur vs Bot',
      text: 'Défiez un bot : du Pousse-Bois au Grand Maître, ou vos propres créations.',
    },
    {
      mode: 'eve',
      icon: '🤖',
      title: 'Bot vs Bot',
      text: 'Regardez deux bots s’affronter et comparez leurs types de réflexion.',
    },
  ];
  const top = h('div', { class: 'card' }, loading());
  const recent = h('div', { class: 'card' }, loading());
  const stats = h('div', { class: 'stats' });
  clear(
    el,
    h(
      'section',
      { class: 'hero' },
      h('img', { src: '/logo.svg', alt: 'Logo ChessArena' }),
      h(
        'div',
        null,
        h('h1', null, 'Bienvenue dans l’arène ♞'),
        h(
          'p',
          null,
          'Jouez aux échecs contre vos amis ou contre des bots dont vous choisissez les calculs : sécurité des pièces, contrôle du centre, vision à plusieurs coups… Chaque partie classée fait évoluer le classement Elo.',
        ),
      ),
    ),
    h(
      'section',
      { class: 'grid grid-3' },
      modes.map((m) =>
        h(
          'a',
          { class: 'card mode-card', href: `#/new/${m.mode}` },
          h('span', { class: 'icon' }, m.icon),
          h('h2', null, m.title),
          h('p', null, m.text),
          h('span', { class: 'btn primary' }, 'Jouer'),
        ),
      ),
    ),
    h('div', { style: 'height:1rem' }),
    stats,
    h('div', { style: 'height:1rem' }),
    h('section', { class: 'grid grid-2' }, top, recent),
  );

  const [board, games, s] = await Promise.all([
    state.api.leaderboard({ sort: 'rating' }),
    state.api.games({ limit: 6 }),
    state.api.stats(),
  ]);
  clear(
    stats,
    [
      [s.games, 'parties jouées'],
      [s.humans, 'joueurs humains'],
      [s.bots, 'bots'],
      [s.games ? `${Math.round((s.whiteWins / s.games) * 100)}%` : '–', 'victoires des Blancs'],
      [s.averageLength, 'demi-coups / partie'],
    ].map(([v, label]) => h('div', { class: 'stat' }, h('b', null, v), h('span', null, label))),
  );
  clear(
    top,
    h(
      'div',
      { class: 'row' },
      h('h2', null, '🏆 Top 5'),
      h('span', { class: 'spacer' }),
      h('a', { href: '#/leaderboard' }, 'Classement complet →'),
    ),
    board.length
      ? h(
          'div',
          { class: 'stack' },
          board.slice(0, 5).map((r) => formRow(r)),
        )
      : h('p', { class: 'empty' }, 'Aucun joueur classé.'),
  );
  clear(
    recent,
    h(
      'div',
      { class: 'row' },
      h('h2', null, '🕑 Dernières parties'),
      h('span', { class: 'spacer' }),
      h('a', { href: '#/games' }, 'Tout voir →'),
    ),
    games.length
      ? h(
          'div',
          { class: 'stack' },
          games.map((g) =>
            h(
              'a',
              { href: `#/game/${g.id}`, class: 'row', style: 'color:inherit' },
              h(
                'span',
                null,
                playerLink(g.whiteId, g.whiteName, false),
                ' vs ',
                playerLink(g.blackId, g.blackName, false),
              ),
              h('span', { class: 'spacer' }),
              h(
                'span',
                { class: 'small muted' },
                `${resultLabel(g.result, g.whiteName, g.blackName)} · ${REASON_LABELS[g.reason]} · ${relativeTime(g.playedAt)}`,
              ),
            ),
          ),
        )
      : h('p', { class: 'empty' }, 'Aucune partie pour l’instant — lancez-en une !'),
  );
}
