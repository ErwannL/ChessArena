import { REASON_LABELS, resultLabel } from '../../src/client/format';
import { Game } from '../../src/engine/game';
import { findKing } from '../../src/engine/movegen';
import { BoardView } from '../board';
import { clear, errorMessage, h, loading, toast } from '../dom';
import { state } from '../state';
import { delta, playerLink } from './shared';
import { gamesTable } from './profile';

export async function gamesView(el: HTMLElement): Promise<void> {
  clear(el, loading());
  const games = await state.api.games({ limit: 100 });
  clear(el, h('h1', null, '🕑 Historique des parties'), gamesTable(games));
}

export function replayView(el: HTMLElement, params: string[]): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  let cleanup = () => {};
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  (async () => {
    clear(el, loading());
    let record;
    try {
      record = await state.api.game(params[0]);
    } catch (e) {
      clear(el, h('div', { class: 'card empty' }, errorMessage(e)));
      return;
    }
    const games: Game[] = [new Game()];
    for (const san of record.moves) {
      const next = new Game(games[games.length - 1].fen());
      next.move(san);
      games.push(next);
    }
    let ply = games.length - 1;
    let flipped = false;
    const board = new BoardView(() => {});
    const movesBox = h('div', { class: 'moves' });
    const info = h('div', { class: 'small muted' });

    const show = (n: number) => {
      ply = Math.max(0, Math.min(games.length - 1, n));
      const g = games[ply];
      const last = g.lastMove();
      board.update({
        pos: g.position,
        legal: [],
        lastMove: last,
        check: g.inCheck() ? findKing(g.position.board, g.turn) : null,
        flipped,
        interactive: false,
      });
      info.textContent = `Demi-coup ${ply} / ${games.length - 1}`;
      clear(
        movesBox,
        record!.moves.flatMap((san, i) => [
          i % 2 === 0 ? h('span', { class: 'no' }, `${i / 2 + 1}.`) : null,
          h(
            'span',
            { class: `mv ${i + 1 === ply ? 'current' : ''}`, onclick: () => (stop(), show(i + 1)) },
            san,
          ),
        ]),
      );
    };
    const nav = (label: string, title: string, fn: () => void) =>
      h('button', { class: 'btn small', title, onclick: () => (stop(), fn()) }, label);
    const autoplay = h(
      'button',
      {
        class: 'btn small',
        onclick: () => {
          if (timer) return stop();
          if (ply === games.length - 1) show(0);
          timer = setInterval(() => (ply >= games.length - 1 ? stop() : show(ply + 1)), 800);
        },
      },
      '⏯ Lecture',
    );
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') show(ply - 1);
      if (e.key === 'ArrowRight') show(ply + 1);
    };
    document.addEventListener('keydown', onKey);
    cleanup = () => document.removeEventListener('keydown', onKey);

    async function copy() {
      try {
        await navigator.clipboard.writeText(record!.pgn);
        toast('PGN copié');
      } catch {
        prompt('PGN :', record!.pgn);
      }
    }
    function download() {
      const a = h('a', {
        href: URL.createObjectURL(new Blob([record!.pgn], { type: 'application/x-chess-pgn' })),
        download: `chessarena-${record!.id}.pgn`,
      });
      a.click();
      URL.revokeObjectURL(a.href);
    }

    clear(
      el,
      h(
        'div',
        { class: 'play' },
        h('div', { class: 'board-col' }, board.el),
        h(
          'aside',
          { class: 'side' },
          h(
            'div',
            { class: 'banner stack' },
            h('h2', null, resultLabel(record.result, record.whiteName, record.blackName)),
            h(
              'div',
              null,
              playerLink(record.whiteId, record.whiteName),
              ' vs ',
              playerLink(record.blackId, record.blackName),
            ),
            h(
              'div',
              { class: 'muted small' },
              `${REASON_LABELS[record.reason]} · ${new Date(record.playedAt).toLocaleString('fr-FR')} · ${record.rated ? 'classée' : 'amicale'}`,
            ),
            record.rated
              ? h(
                  'div',
                  null,
                  `${record.whiteName} (${record.whiteRatingBefore}) `,
                  delta(record.whiteDelta),
                  ` · ${record.blackName} (${record.blackRatingBefore}) `,
                  delta(record.blackDelta),
                )
              : null,
          ),
          h(
            'div',
            { class: 'card stack' },
            h(
              'div',
              { class: 'row' },
              nav('⏮', 'Début', () => show(0)),
              nav('◀', 'Précédent', () => show(ply - 1)),
              autoplay,
              nav('▶', 'Suivant', () => show(ply + 1)),
              nav('⏭', 'Fin', () => show(games.length - 1)),
            ),
            info,
            movesBox,
            h(
              'div',
              { class: 'row' },
              h(
                'button',
                { class: 'btn small', onclick: () => ((flipped = !flipped), show(ply)) },
                '🔄 Retourner',
              ),
              h('button', { class: 'btn small', onclick: copy }, '📋 Copier PGN'),
              h('button', { class: 'btn small', onclick: download }, '⬇️ Télécharger'),
            ),
          ),
        ),
      ),
    );
    show(ply);
  })();
  return () => {
    stop();
    cleanup();
  };
}
