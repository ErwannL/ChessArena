import type { GameRecord } from '../../src/arena/types';
import { percent, REASON_LABELS, relativeTime } from '../../src/client/format';
import { clear, errorMessage, h, loading, toast } from '../dom';
import { savePrefs, state } from '../state';
import { delta, formDots, playerLink, ratingChart } from './shared';

export function gamesTable(games: GameRecord[], perspective?: string): HTMLElement {
  if (!games.length) return h('div', { class: 'card empty' }, 'Aucune partie.');
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
          h('th', null, 'Date'),
          h('th', null, 'Blancs'),
          h('th', null, 'Noirs'),
          h('th', null, 'Résultat'),
          h('th', { class: 'hide-sm' }, 'Fin'),
          h('th', { class: 'hide-sm' }, 'Coups'),
          h('th', null, 'Elo'),
        ),
      ),
      h(
        'tbody',
        null,
        games.map((g) => {
          const me = perspective === g.whiteId ? 'w' : perspective === g.blackId ? 'b' : null;
          const outcome = !me
            ? null
            : g.result === '1/2-1/2'
              ? 'd'
              : (g.result === '1-0') === (me === 'w')
                ? 'w'
                : 'l';
          return h(
            'tr',
            { onclick: () => (location.hash = `#/game/${g.id}`) },
            h('td', { class: 'small muted' }, relativeTime(g.playedAt)),
            h('td', null, playerLink(g.whiteId, g.whiteName, me === 'w')),
            h('td', null, playerLink(g.blackId, g.blackName, me === 'b')),
            h('td', { class: outcome ?? '' }, g.result),
            h('td', { class: 'hide-sm small' }, REASON_LABELS[g.reason]),
            h('td', { class: 'hide-sm' }, Math.ceil(g.moves.length / 2)),
            h(
              'td',
              null,
              g.rated
                ? me
                  ? delta(me === 'w' ? g.whiteDelta : g.blackDelta)
                  : h('span', { class: 'small' }, delta(g.whiteDelta), ' / ', delta(g.blackDelta))
                : h('span', { class: 'muted small' }, 'amicale'),
            ),
          );
        }),
      ),
    ),
  );
}

export async function profileView(el: HTMLElement, params: string[]): Promise<void> {
  clear(el, loading());
  let profile;
  try {
    profile = await state.api.profile(params[0]);
  } catch (e) {
    clear(el, h('div', { class: 'card empty' }, errorMessage(e)));
    return;
  }
  const { player: p, rank, headToHead, recentGames } = profile;
  const tile = (value: unknown, label: string) =>
    h('div', { class: 'stat' }, h('b', null, value as string), h('span', null, label));
  const perf = p.games
    ? Math.round(p.opponentsRatingSum / p.games + (400 * (p.wins - p.losses)) / p.games)
    : '–';

  async function rename() {
    const name = prompt('Nouveau nom :', p.name);
    if (!name) return;
    try {
      await state.api.updatePlayer(p.id, { name });
      profileView(el, params);
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }
  async function toggleRanked() {
    await state.api.updatePlayer(p.id, { ranked: !p.ranked });
    profileView(el, params);
  }
  async function remove() {
    if (!confirm(`Supprimer « ${p.name} » ? Ses parties restent dans l’historique.`)) return;
    await state.api.deletePlayer(p.id);
    toast('Joueur supprimé');
    location.hash = '#/leaderboard';
  }

  clear(
    el,
    h(
      'div',
      { class: 'row' },
      h('span', { style: 'font-size:3rem' }, p.bot?.avatar ?? '🙂'),
      h(
        'div',
        null,
        h(
          'h1',
          { style: 'margin:0' },
          p.name,
          ' ',
          p.kind === 'bot' ? h('span', { class: 'badge-bot' }, 'BOT') : null,
        ),
        h(
          'div',
          { class: 'muted' },
          rank ? `#${rank} au classement général` : 'Non classé',
          ` · membre depuis ${new Date(p.createdAt).toLocaleDateString('fr-FR')} · dernière partie ${relativeTime(p.lastPlayedAt)}`,
        ),
      ),
      h('span', { class: 'spacer' }),
      p.kind === 'bot'
        ? h(
            'button',
            {
              class: 'btn small primary',
              onclick: () => (savePrefs({ 'pve-bot': p.id }), (location.hash = '#/new/pve')),
            },
            '⚔️ Affronter',
          )
        : h(
            'button',
            {
              class: 'btn small primary',
              onclick: () => (savePrefs({ 'pve-human': p.id }), (location.hash = '#/new/pve')),
            },
            '▶ Jouer',
          ),
      p.kind === 'bot'
        ? h('a', { class: 'btn small', href: `#/bots/edit/${p.id}` }, '✏️ Configurer')
        : h('button', { class: 'btn small', onclick: rename }, '✏️ Renommer'),
      h(
        'button',
        { class: 'btn small', onclick: toggleRanked },
        p.ranked ? '🚫 Retirer du classement' : '🏆 Classer',
      ),
      h('button', { class: 'btn small danger', onclick: remove }, '🗑'),
    ),
    h('div', { style: 'height:1rem' }),
    h(
      'div',
      { class: 'stats' },
      tile(p.rating, 'Elo actuel'),
      tile(p.peak, 'Elo max'),
      tile(p.lowest, 'Elo min'),
      tile(perf, 'Performance'),
      tile(p.games, 'Parties'),
      tile(percent(p.wins, p.games), 'Victoires'),
      tile(`${p.wins} / ${p.draws} / ${p.losses}`, 'V / N / D'),
      tile(
        p.streak > 0 ? `🔥 ${p.streak}` : p.streak < 0 ? `❄️ ${-p.streak}` : '–',
        'Série en cours',
      ),
      tile(p.bestStreak, 'Meilleure série'),
      tile(`${p.asWhite.wins}/${p.asWhite.draws}/${p.asWhite.losses}`, 'Avec les Blancs'),
      tile(`${p.asBlack.wins}/${p.asBlack.draws}/${p.asBlack.losses}`, 'Avec les Noirs'),
    ),
    h('div', { style: 'height:1rem' }),
    h(
      'div',
      { class: 'grid grid-2' },
      h(
        'div',
        { class: 'card' },
        h(
          'div',
          { class: 'row' },
          h('h2', null, '📈 Évolution Elo'),
          h('span', { class: 'spacer' }),
          formDots(p.recent),
        ),
        ratingChart(p.history),
      ),
      h(
        'div',
        { class: 'card' },
        h('h2', null, '⚔️ Face-à-face'),
        headToHead.length
          ? h(
              'div',
              { class: 'stack' },
              headToHead
                .slice(0, 8)
                .map((x) =>
                  h(
                    'div',
                    { class: 'row' },
                    playerLink(x.opponentId, x.opponentName),
                    h('span', { class: 'spacer' }),
                    h(
                      'span',
                      { class: 'small' },
                      h('span', { class: 'w' }, `${x.wins}V`),
                      ' ',
                      h('span', { class: 'd' }, `${x.draws}N`),
                      ' ',
                      h('span', { class: 'l' }, `${x.losses}D`),
                      h('span', { class: 'muted' }, ` (${x.games})`),
                    ),
                  ),
                ),
            )
          : h('p', { class: 'muted' }, 'Aucun adversaire pour l’instant.'),
      ),
    ),
    h('h2', { style: 'margin-top:1.5rem' }, '🕑 Dernières parties'),
    gamesTable(recentGames, p.id),
  );
}
