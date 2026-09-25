import type { Color, PieceType } from '../src/engine/types';
import { h } from './dom';

const GLYPHS: Record<PieceType, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

export function glyph(type: PieceType): string {
  return GLYPHS[type] + '︎';
}

export function pieceEl(type: PieceType, color: Color): HTMLSpanElement {
  return h('span', { class: `piece ${color}`, 'aria-hidden': 'true' }, glyph(type));
}
