import type { GameRecord } from '../../src/arena/types';
import { MATE } from '../../src/bots/search';
import { formatEval, REASON_LABELS, resultLabel } from '../../src/client/format';
import { GameSession, type Seat } from '../../src/client/session';
import { PIECE_VALUES, opposite } from '../../src/engine/board';
import { findKing } from '../../src/engine/movegen';
import type { Color, PieceType } from '../../src/engine/types';
import { BoardView } from '../board';
import { clear, errorMessage, h, toast } from '../dom';
import { botThink, cancelThinking } from '../engine';
import { glyph } from '../pieces';
import { state } from '../state';
import type { ThinkResult } from '../thinker';
import { delta } from './shared';

const START_COUNT: Record<PieceType, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };

function captured(session: GameSession, color: Color): { pieces: string; advantage: number } {
  const counts: Record<string, number> = {};
  let material = 0;
  for (const p of session.game.position.board) {
    if (!p) continue;
    counts[p.color + p.type] = (counts[p.color + p.type] ?? 0) + 1;
    material += (p.color === color ? 1 : -1) * PIECE_VALUES[p.type];
  }
  const enemy = opposite(color);
  let pieces = '';
  for (const t of ['q', 'r', 'b', 'n', 'p'] as PieceType[]) {
    const missing = Math.max(0, START_COUNT[t] - (counts[enemy + t] ?? 0));
    pieces += glyph(t).repeat(missing);
  }
  return { pieces, advantage: Math.round(material / 100) };
}

export function playView(el: HTMLElement): () => void {
  const session = state.session;
  if (!session) {
    location.hash = '#/new/pve';
    return () => {};
  }
  let alive = true;
  let thinking = false;
  let paused = false;
  let flipped = session.white.kind === 'bot' && session.black.kind === 'human';
  let lastThink: { color: Color; result: ThinkResult } | null = null;
  let record: GameRecord | null = null;
  let finished = false;

  const board = new BoardView((m) => {
    session.game.move({ from: m.from, to: m.to, promotion: m.promotion });
    afterMove();
  });
  const topBar = h('div', { class: 'player-bar' });
  const bottomBar = h('div', { class: 'player-bar' });
  const statusBox = h('div');
  const botBox = h('div', { class: 'card stack' });
  const movesBox = h('div', { class: 'moves' });
  const controls = h('div', { class: 'controls' });

  function seatBar(bar: HTMLElement, color: Color) {
    const seat = session!.seat(color);
    const cap = captured(session!, color);
    bar.classList.toggle('turn', session!.game.turn === color && !session!.game.status().over);
    clear(
      bar,
      h('span', { class: 'avatar' }, seat.avatar),
      h(
        'div',
        null,
        h(
          'div',
          { class: 'name' },
          seat.playerId
            ? h('a', { href: `#/player/${seat.playerId}`, style: 'color:inherit' }, seat.name)
            : seat.name,
          ' ',
          seat.kind === 'bot' ? h('span', { class: 'badge-bot' }, 'BOT') : null,
        ),
        h(
          'div',
          { class: 'small muted' },
          color === 'w' ? 'Blancs' : 'Noirs',
          seat.rating ? ` · ${seat.rating}` : '',
          thinking && session!.game.turn === color
            ? h('span', { class: 'thinking' }, ' · réfléchit…')
            : null,
        ),
      ),
      h(
        'span',
        { class: 'captured', title: 'Pièces capturées' },
        cap.pieces,
        cap.advantage > 0 ? ` +${cap.advantage}` : '',
      ),
    );
  }

  function renderMoves() {
    const list = session!.game.moveList();
    const firstBlack = list[0]?.color === 'b';
    const cells: HTMLElement[] = [];
    const moves = firstBlack ? [null, ...list] : list;
    for (let i = 0; i < moves.length; i += 2) {
      cells.push(h('span', { class: 'no' }, `${i / 2 + 1}.`));
      for (const m of [moves[i], moves[i + 1]]) {
        cells.push(
          h(
            'span',
            { class: `mv ${m && m === list[list.length - 1] ? 'current' : ''}` },
            m?.san ?? (m === null ? '…' : ''),
          ),
        );
      }
    }
    clear(
      movesBox,
      cells.length
        ? cells
        : h('span', { class: 'muted small', style: 'grid-column: span 3' }, 'Aucun coup joué.'),
    );
    movesBox.scrollTop = movesBox.scrollHeight;
  }

  function renderBot() {
    const hasBot = session!.white.kind === 'bot' || session!.black.kind === 'bot';
    botBox.hidden = !hasBot;
    if (!hasBot) return;
    if (!lastThink) {
      clear(
        botBox,
        h('h3', null, '🧠 Réflexion du bot'),
        h(
          'p',
          { class: 'small muted' },
          'Le bot affichera ici son évaluation et les coups qu’il a envisagés.',
        ),
      );
      return;
    }
    const { color, result } = lastThink;
    const whiteScore = color === 'w' ? result.score : -result.score;
    const pct =
      Math.abs(whiteScore) >= MATE - 1000
        ? whiteScore > 0
          ? 100
          : 0
        : 50 + 50 * Math.tanh(whiteScore / 600);
    const seat = session!.seat(color);
    clear(
      botBox,
      h('h3', null, `🧠 ${seat.avatar} ${seat.name} a pensé`),
      h(
        'div',
        { class: 'evalbar', title: 'Évaluation (côté Blancs)' },
        h('div', { style: `width:${pct}%` }),
      ),
      h(
        'div',
        { class: 'row small muted' },
        h('span', null, `Évaluation : ${formatEval(whiteScore)}`),
        h('span', { class: 'spacer' }),
        h('span', null, `${result.nodes.toLocaleString('fr-FR')} positions · ${result.ms} ms`),
      ),
      h('div', { class: 'small' }, 'Coup joué : ', h('b', null, result.played ?? '—')),
      h('div', { class: 'small muted' }, 'Meilleurs coups envisagés (évaluation côté Blancs) :'),
      h(
        'div',
        { class: 'candidates' },
        result.candidates.map((c) =>
          h(
            'div',
            null,
            h('b', null, c.san, c.san === result.played ? ' ✔' : ''),
            h('span', { class: 'muted' }, formatEval(color === 'w' ? c.score : -c.score)),
          ),
        ),
      ),
    );
  }

  function renderStatus() {
    const status = session!.game.status();
    const series = state.series;
    const seriesLine =
      series && session!.mode === 'eve'
        ? h(
            'p',
            { class: 'small' },
            `Série : partie ${Math.min(series.played + (finished ? 0 : 1), series.total)}/${series.total} — ${session!.white.name} ${series.points[session!.white.playerId!] ?? 0} · ${series.points[session!.black.playerId!] ?? 0} ${session!.black.name}`,
          )
        : null;
    if (!status.over) {
      const seat = session!.toMove;
      clear(
        statusBox,
        h(
          'div',
          { class: 'card' },
          h('b', null, `Trait aux ${session!.game.turn === 'w' ? 'Blancs' : 'Noirs'}`),
          h('span', { class: 'muted' }, ` — ${seat.name}`),
          session!.game.inCheck() ? h('b', { class: 'l' }, ' · Échec !') : null,
          h(
            'p',
            { class: 'small muted', style: 'margin:0.3rem 0 0' },
            session!.recordable ? '✅ Partie classée' : 'ℹ️ Partie amicale (non comptée)',
          ),
          seriesLine,
        ),
      );
      return;
    }
    const deltas = record
      ? h(
          'p',
          null,
          session!.white.name,
          ' ',
          delta(record.whiteDelta),
          ' · ',
          session!.black.name,
          ' ',
          delta(record.blackDelta),
        )
      : null;
    clear(
      statusBox,
      h(
        'div',
        { class: 'banner stack' },
        h('h2', null, resultLabel(status.result, session!.white.name, session!.black.name)),
        h('div', { class: 'muted' }, `${REASON_LABELS[status.reason!]} · ${status.result}`),
        deltas,
        seriesLine,
        h(
          'div',
          { class: 'row', style: 'justify-content:center' },
          h('button', { class: 'btn primary', onclick: rematch }, '🔁 Revanche'),
          h('a', { class: 'btn', href: `#/new/${session!.mode}` }, 'Nouvelle partie'),
          record ? h('a', { class: 'btn', href: `#/game/${record.id}` }, 'Revoir') : null,
        ),
      ),
    );
  }

  function renderControls() {
    const status = session!.game.status();
    const humans = (['w', 'b'] as Color[]).filter((c) => session!.seat(c).kind === 'human');
    const resignColor = session!.mode === 'pvp' ? session!.game.turn : humans[0];
    clear(
      controls,
      h(
        'button',
        {
          class: 'btn small',
          onclick: () => ((flipped = !flipped), refresh()),
          title: 'Retourner l’échiquier',
        },
        '🔄 Retourner',
      ),
      session!.mode !== 'eve'
        ? h(
            'button',
            {
              class: 'btn small',
              disabled: !session!.canUndo() || thinking,
              onclick: () => (session!.undo(), (lastThink = null), (finished = false), refresh()),
            },
            '↶ Annuler',
          )
        : h(
            'button',
            {
              class: 'btn small',
              disabled: status.over,
              onclick: () => ((paused = !paused), paused ? refresh() : afterMove()),
            },
            paused ? '▶ Reprendre' : '⏸ Pause',
          ),
      session!.mode !== 'eve'
        ? h('button', { class: 'btn small', disabled: status.over, onclick: offerDraw }, '½ Nulle')
        : null,
      resignColor
        ? h(
            'button',
            {
              class: 'btn small danger',
              disabled: status.over,
              onclick: () =>
                confirm('Abandonner la partie ?') &&
                (session!.game.resign(resignColor), afterMove()),
            },
            '🏳 Abandonner',
          )
        : h(
            'button',
            {
              class: 'btn small danger',
              disabled: status.over,
              onclick: () => (session!.game.agreeDraw(), afterMove()),
            },
            '⏹ Arrêter (nulle)',
          ),
      h('button', { class: 'btn small ghost', onclick: copyPgn }, '📋 PGN'),
    );
  }

  function refresh() {
    if (!alive) return;
    const g = session!.game;
    const status = g.status();
    const last = g.lastMove();
    const humanTurn = !status.over && session!.toMove.kind === 'human' && !thinking;
    board.update({
      pos: g.position,
      legal: humanTurn ? g.moves() : [],
      lastMove: last,
      check: g.inCheck() ? findKing(g.position.board, g.turn) : null,
      flipped,
      interactive: humanTurn,
    });
    const top: Color = flipped ? 'w' : 'b';
    seatBar(topBar, top);
    seatBar(bottomBar, opposite(top));
    renderStatus();
    renderBot();
    renderMoves();
    renderControls();
  }

  async function afterMove() {
    refresh();
    if (!alive) return;
    if (session!.game.status().over) return finish();
    if (session!.isBotTurn() && !thinking && !paused) await botPlay();
  }

  async function botPlay() {
    const seat: Seat = session!.toMove;
    const color = session!.game.turn;
    thinking = true;
    refresh();
    const started = performance.now();
    const result = await botThink(session!.game.fen(), seat.bot!, session!.game.positionKeys());
    const minDelay = session!.mode === 'eve' ? state.eveDelay : 350;
    const wait = minDelay - (performance.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    thinking = false;
    if (!alive || state.session !== session || session!.game.status().over) return;
    if (result.uci) {
      session!.game.move(result.uci);
      lastThink = { color, result };
    }
    await afterMove();
  }

  async function finish() {
    if (finished) return;
    finished = true;
    const payload = session!.resultPayload();
    if (payload) {
      try {
        record = await state.api.recordGame(payload);
        session!.recorded = true;
      } catch (e) {
        toast(`Partie non enregistrée : ${errorMessage(e)}`, 'error');
      }
    }
    const series = state.series;
    if (series && session!.mode === 'eve') {
      series.played++;
      const r = session!.game.status().result;
      const w = session!.white.playerId!;
      const b = session!.black.playerId!;
      series.points[w] += r === '1-0' ? 1 : r === '1/2-1/2' ? 0.5 : 0;
      series.points[b] += r === '0-1' ? 1 : r === '1/2-1/2' ? 0.5 : 0;
      if (series.played < series.total) {
        setTimeout(() => {
          if (!alive || state.session !== session) return;
          state.session = new GameSession(session!.black, session!.white);
          location.hash = '#/play?' + series.played;
        }, 1800);
      } else {
        toast(
          `Série terminée : ${session!.white.name} ${series.points[w]} – ${series.points[b]} ${session!.black.name}`,
        );
      }
    }
    refresh();
  }

  function rematch() {
    state.session = new GameSession(session!.black, session!.white);
    if (state.series) state.series = null;
    location.hash = '#/play?' + Date.now();
  }

  function offerDraw() {
    if (session!.mode === 'pvp') {
      if (confirm('Les deux joueurs acceptent la nulle ?')) {
        session!.game.agreeDraw();
        afterMove();
      }
      return;
    }
    const botColor: Color = session!.white.kind === 'bot' ? 'w' : 'b';
    const botScore = lastThink && lastThink.color === botColor ? lastThink.result.score : 0;
    if (botScore < -150 || session!.game.history().length > 120) {
      toast('Le bot accepte la nulle 🤝');
      session!.game.agreeDraw();
      afterMove();
    } else {
      toast('Le bot refuse la nulle : il pense avoir ses chances.');
    }
  }

  async function copyPgn() {
    const pgn = session!.game.pgn({ White: session!.white.name, Black: session!.black.name });
    try {
      await navigator.clipboard.writeText(pgn);
      toast('PGN copié dans le presse-papiers');
    } catch {
      prompt('PGN de la partie :', pgn);
    }
  }

  clear(
    el,
    h(
      'div',
      { class: 'play' },
      h('div', { class: 'board-col' }, topBar, board.el, bottomBar),
      h(
        'aside',
        { class: 'side' },
        statusBox,
        h('div', { class: 'card stack' }, h('h3', null, 'Coups'), movesBox, controls),
        botBox,
      ),
    ),
  );
  afterMove();

  return () => {
    alive = false;
    cancelThinking();
  };
}
