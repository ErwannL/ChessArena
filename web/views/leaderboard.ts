import type { LeaderboardQuery, LeaderboardRow } from '../../src/arena/types';
import { percent, relativeTime } from '../../src/client/format';
import { clear, h, loading } from '../dom';
import { loadPrefs, savePrefs, state } from '../state';
import { formDots, trend } from './shared';

const SORTS: [NonNullable<LeaderboardQuery['sort']>, string][] = [
  ['rating', 'Elo'],
  ['peak', 'Meilleur Elo'],
  ['performance', 'Performance'],
  ['winRate', '% de victoires'],
  ['wins', 'Victoires'],
  ['games', 'Parties jouées'],
  ['streak', 'Série en cours'],
];

export async function leaderboardView(el: HTMLElement): Promise<void> {
  const prefs = loadPrefs();
  const query: LeaderboardQuery = {
    kind: (prefs['lb-kind'] as LeaderboardQuery['kind']) ?? 'all',
    includeUnranked: prefs['lb-unranked'] === 'true',
    minGames: Number(prefs['lb-min'] ?? 0),
    sort: (prefs['lb-sort'] as LeaderboardQuery['sort']) ?? 'rating',
    search: '',
  };
  const tableBox = h('div', null, loading());
  const summary = h('p', { class: 'small muted' });

  const kindTabs = h('div', { class: 'tabs', role: 'tablist' });
  const renderTabs = () =>
    clear(
      kindTabs,
      (
        [
          ['all', 'Tous'],
          ['human', '🙂 Humains'],
          ['bot', '🤖 Bots'],
        ] as const
      ).map(([k, label]) =>
        h(
          'button',
          {
            class: query.kind === k ? 'active' : '',
            onclick: () => ((query.kind = k), renderTabs(), load()),
          },
          label,
        ),
      ),
    );
  renderTabs();

  const sort = h(
    'select',
    { 'aria-label': 'Trier par' },
    SORTS.map(([v, l]) => h('option', { value: v }, l)),
  );
  sort.value = query.sort!;
  sort.addEventListener(
    'change',
    () => ((query.sort = sort.value as LeaderboardQuery['sort']), load()),
  );
  const min = h(
    'select',
    { 'aria-label': 'Parties minimum' },
    [0, 1, 5, 10, 30].map((n) => h('option', { value: n }, n ? `≥ ${n} parties` : 'Toutes')),
  );
  min.value = String(query.minGames);
  min.addEventListener('change', () => ((query.minGames = Number(min.value)), load()));
  const unranked = h('input', { type: 'checkbox', checked: query.includeUnranked });
  unranked.addEventListener('change', () => ((query.includeUnranked = unranked.checked), load()));
  const search = h('input', {
    type: 'search',
    placeholder: 'Rechercher…',
    'aria-label': 'Rechercher un joueur',
  });
  let timer: ReturnType<typeof setTimeout>;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => ((query.search = search.value), load()), 200);
  });

  clear(
    el,
    h(
      'div',
      { class: 'row' },
      h('h1', null, '🏆 Classement'),
      h('span', { class: 'spacer' }),
      kindTabs,
    ),
    h(
      'div',
      { class: 'filters card' },
      h('div', { class: 'field' }, h('label', null, 'Trier par'), sort),
      h('div', { class: 'field' }, h('label', null, 'Expérience'), min),
      h('div', { class: 'field', style: 'flex:1' }, h('label', null, 'Recherche'), search),
      h(
        'label',
        { class: 'row small', style: 'min-height:42px' },
        unranked,
        'Inclure les non classés',
      ),
    ),
    summary,
    tableBox,
    h(
      'p',
      { class: 'small muted' },
      'Elo : système FIDE (K=40 pour les 30 premières parties, 20 ensuite, 10 au-delà de 2400). Performance : moyenne des adversaires ± 400 × (V − D) / parties. Tendance : évolution sur les 5 dernières parties.',
    ),
  );

  async function load() {
    savePrefs({
      'lb-kind': query.kind!,
      'lb-unranked': String(query.includeUnranked),
      'lb-min': String(query.minGames),
      'lb-sort': query.sort!,
    });
    const rows = await state.api.leaderboard(query);
    summary.textContent = `${rows.length} joueur${rows.length > 1 ? 's' : ''} · ${rows.filter((r) => r.kind === 'bot').length} bot(s) · ${rows.reduce((n, r) => n + r.games, 0)} participations`;
    clear(
      tableBox,
      rows.length
        ? table(rows)
        : h('div', { class: 'card empty' }, 'Aucun joueur ne correspond à ces filtres.'),
    );
  }
  await load();
}

function table(rows: LeaderboardRow[]): HTMLElement {
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      null,
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', null, '#'),
          h('th', null, 'Joueur'),
          h('th', null, 'Elo'),
          h('th', { class: 'hide-sm' }, 'Pic'),
          h('th', null, 'Parties'),
          h('th', { class: 'hide-sm' }, 'V / N / D'),
          h('th', { class: 'hide-sm' }, 'Victoires'),
          h('th', { class: 'hide-sm' }, 'Série'),
          h('th', { class: 'hide-sm' }, 'Perf.'),
          h('th', null, 'Forme'),
          h('th', { class: 'hide-sm' }, 'Dernière partie'),
        ),
      ),
      h(
        'tbody',
        null,
        rows.map((r) =>
          h(
            'tr',
            {
              class: r.rank <= 3 ? `top${r.rank}` : '',
              onclick: () => (location.hash = `#/player/${r.id}`),
            },
            h('td', { class: 'rank' }, r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank),
            h(
              'td',
              null,
              h('span', { style: 'font-size:1.2rem' }, r.avatar),
              ' ',
              h('a', { href: `#/player/${r.id}`, style: 'color:inherit;font-weight:700' }, r.name),
              ' ',
              r.kind === 'bot' ? h('span', { class: 'badge-bot' }, 'BOT') : null,
              ' ',
              r.ranked ? null : h('span', { class: 'badge-unranked' }, 'non classé'),
            ),
            h('td', { class: 'rating' }, r.rating, ' ', trend(r.trend)),
            h('td', { class: 'hide-sm' }, r.peak),
            h('td', null, r.games),
            h(
              'td',
              { class: 'hide-sm' },
              h('span', { class: 'w' }, r.wins),
              ' / ',
              h('span', { class: 'd' }, r.draws),
              ' / ',
              h('span', { class: 'l' }, r.losses),
            ),
            h(
              'td',
              { class: 'hide-sm' },
              h(
                'span',
                { class: 'winbar' },
                h('span', { class: 'ww', style: `width:${r.winRate}%` }),
                h('span', { class: 'dd', style: `width:${r.drawRate}%` }),
              ),
              percent(r.wins, r.games),
            ),
            h(
              'td',
              { class: 'hide-sm' },
              r.streak > 0 ? `🔥 ${r.streak}` : r.streak < 0 ? `❄️ ${-r.streak}` : '–',
              h('span', { class: 'muted small' }, ` (max ${r.bestStreak})`),
            ),
            h('td', { class: 'hide-sm' }, r.performance ?? '–'),
            h('td', null, r.form.length ? formDots(r.form) : h('span', { class: 'muted' }, '–')),
            h('td', { class: 'hide-sm muted small' }, relativeTime(r.lastPlayedAt)),
          ),
        ),
      ),
    ),
  );
}
