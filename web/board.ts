import { fileOf, FILES, rankOf, squareName } from '../src/engine/board';
import type { Move, PieceType, Position } from '../src/engine/types';
import { h } from './dom';
import { pieceEl } from './pieces';

export interface BoardState {
  pos: Position;
  legal: Move[];
  lastMove: { from: number; to: number } | null;
  check: number | null;
  flipped: boolean;
  interactive: boolean;
}

const PIECE_NAMES: Record<PieceType, string> = {
  k: 'roi',
  q: 'dame',
  r: 'tour',
  b: 'fou',
  n: 'cavalier',
  p: 'pion',
};

/** Interactive chessboard: tap-to-move and drag & drop (mouse, touch, pen). */
export class BoardView {
  readonly el: HTMLDivElement;
  private state: BoardState | null = null;
  private selected: number | null = null;
  private drag: { from: number; ghost: HTMLElement; moved: boolean } | null = null;

  constructor(private readonly onMove: (move: Move) => void) {
    this.el = h('div', { class: 'board', role: 'grid', 'aria-label': 'Échiquier' });
    this.el.addEventListener('pointerdown', (e) => this.pointerDown(e));
    window.addEventListener('pointermove', (e) => this.pointerMove(e));
    window.addEventListener('pointerup', (e) => this.pointerUp(e));
  }

  update(state: BoardState): void {
    this.state = state;
    if (!state.interactive) this.selected = null;
    this.render();
  }

  private targets(): Move[] {
    if (this.selected === null || !this.state) return [];
    return this.state.legal.filter((m) => m.from === this.selected);
  }

  private render(): void {
    const s = this.state!;
    const targets = this.targets();
    this.el.classList.toggle('readonly', !s.interactive);
    this.el.replaceChildren();
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const sq = s.flipped ? row * 8 + (7 - col) : (7 - row) * 8 + col;
        const p = s.pos.board[sq];
        const target = targets.find((m) => m.to === sq);
        const classes = ['sq', (fileOf(sq) + rankOf(sq)) % 2 ? 'light' : 'dark'];
        if (s.lastMove && (s.lastMove.from === sq || s.lastMove.to === sq)) classes.push('last');
        if (this.selected === sq) classes.push('selected');
        if (s.check === sq) classes.push('check');
        if (target) classes.push('target', target.captured ? 'capture' : '');
        const cell = h('div', {
          class: classes.join(' '),
          'data-sq': sq,
          role: 'gridcell',
          'aria-label':
            squareName(sq) +
            (p ? ` ${PIECE_NAMES[p.type]} ${p.color === 'w' ? 'blanc' : 'noir'}` : ''),
        });
        if (p) {
          const el = pieceEl(p.type, p.color);
          if (this.drag?.from === sq && this.drag.moved) el.classList.add('dragging');
          cell.append(el);
        }
        if (col === 0) cell.append(h('span', { class: 'coord rank' }, rankOf(sq) + 1));
        if (row === 7) cell.append(h('span', { class: 'coord file' }, FILES[fileOf(sq)]));
        this.el.append(cell);
      }
    }
  }

  private squareAt(x: number, y: number): number | null {
    const cell = document.elementFromPoint(x, y)?.closest<HTMLElement>('.sq');
    return cell && this.el.contains(cell) ? Number(cell.dataset.sq) : null;
  }

  private pointerDown(e: PointerEvent): void {
    const s = this.state;
    if (!s?.interactive || e.button > 0) return;
    const sq = this.squareAt(e.clientX, e.clientY);
    if (sq === null) return;
    e.preventDefault();
    if (this.selected !== null && this.targets().some((m) => m.to === sq)) {
      this.tryMove(this.selected, sq);
      return;
    }
    const p = s.pos.board[sq];
    if (p && p.color === s.pos.turn && s.legal.some((m) => m.from === sq)) {
      this.selected = sq;
      const ghost = pieceEl(p.type, p.color);
      ghost.classList.add('drag-ghost');
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
      this.drag = { from: sq, ghost, moved: false };
    } else {
      this.selected = null;
    }
    this.render();
  }

  private pointerMove(e: PointerEvent): void {
    if (!this.drag) return;
    if (!this.drag.moved) {
      this.drag.moved = true;
      document.body.append(this.drag.ghost);
      this.render();
    }
    this.drag.ghost.style.left = `${e.clientX}px`;
    this.drag.ghost.style.top = `${e.clientY}px`;
  }

  private pointerUp(e: PointerEvent): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    drag.ghost.remove();
    const sq = this.squareAt(e.clientX, e.clientY);
    if (drag.moved && sq !== null && sq !== drag.from) this.tryMove(drag.from, sq);
    else this.render();
  }

  private tryMove(from: number, to: number): void {
    const moves = this.state!.legal.filter((m) => m.from === from && m.to === to);
    if (!moves.length) {
      this.selected = null;
      this.render();
      return;
    }
    this.selected = null;
    if (moves.length > 1) {
      this.render();
      this.askPromotion(moves);
      return;
    }
    this.onMove(moves[0]);
  }

  private askPromotion(moves: Move[]): void {
    const overlay = h(
      'div',
      { class: 'promo', role: 'dialog', 'aria-label': 'Promotion' },
      moves.map((m) =>
        h(
          'button',
          {
            'aria-label': PIECE_NAMES[m.promotion!],
            onclick: () => {
              overlay.remove();
              this.onMove(m);
            },
          },
          pieceEl(m.promotion!, m.color),
        ),
      ),
    );
    this.el.append(overlay);
  }
}
