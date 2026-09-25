import type { LeaderboardRow, Outcome } from '../../src/arena/types';
import { signed } from '../../src/client/format';
import { h } from '../dom';

export function formDots(form: Outcome[]): HTMLElement {
  const title = form.map((o) => ({ W: 'Victoire', D: 'Nulle', L: 'Défaite' })[o]).join(', ');
  return h(
    'span',
    { class: 'form', title: title || 'Aucune partie' },
    form.map((o) => h('i', { class: o })),
  );
}

export function playerLink(id: string, name: string, bold = true): HTMLElement {
  return h('a', { href: `#/player/${id}`, style: bold ? 'font-weight:700' : '' }, name);
}

export function trend(n: number): HTMLElement {
  if (!n) return h('span', { class: 'muted small' }, '＝');
  return h(
    'span',
    { class: `small ${n > 0 ? 'trend-up' : 'trend-down'}` },
    `${n > 0 ? '▲' : '▼'} ${Math.abs(n)}`,
  );
}

export function delta(n: number): HTMLElement {
  return h('span', { class: `delta ${n > 0 ? 'w' : n < 0 ? 'l' : 'd'}` }, signed(n));
}

/** Compact leaderboard line used on the home page. */
export function formRow(r: LeaderboardRow): HTMLElement {
  return h(
    'a',
    { class: 'row', href: `#/player/${r.id}`, style: 'color:inherit' },
    h('b', { style: 'width:1.6rem' }, `#${r.rank}`),
    h('span', { style: 'font-size:1.3rem' }, r.avatar),
    h(
      'span',
      null,
      r.name,
      ' ',
      r.kind === 'bot' ? h('span', { class: 'badge-bot' }, 'BOT') : null,
    ),
    h('span', { class: 'spacer' }),
    formDots(r.form),
    h('b', { style: 'color:var(--gold-2);min-width:3.2rem;text-align:right' }, r.rating),
  );
}

/** Rating history as an SVG area chart. */
export function ratingChart(points: { at: number; rating: number }[]): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 600 180');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.classList.add('chart');
  const ratings = points.map((p) => p.rating);
  const min = Math.min(...ratings) - 20;
  const max = Math.max(...ratings) + 20;
  const x = (i: number) => (points.length === 1 ? 300 : (i / (points.length - 1)) * 600);
  const y = (r: number) => 170 - ((r - min) / (max - min)) * 160;
  const line = points
    .map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.rating).toFixed(1)}`)
    .join(' ');
  svg.innerHTML = `<defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2b53a" stop-opacity="0.35"/><stop offset="1" stop-color="#f2b53a" stop-opacity="0"/></linearGradient></defs>
    <path class="area" d="${line} L600,180 L0,180 Z"/><path class="line" d="${line}"/>
    <text x="4" y="14" fill="#9aa0bd" font-size="12">${Math.round(max - 20)}</text>
    <text x="4" y="176" fill="#9aa0bd" font-size="12">${Math.round(min + 20)}</text>`;
  return svg;
}
