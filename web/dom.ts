export type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, unknown>;

const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'min', 'max', 'step']);

/** Tiny hyperscript helper: h('div', { class: 'x', onclick }, 'text', child). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2), value as EventListener);
    } else if (PROPS.has(key)) {
      (el as unknown as Record<string, unknown>)[key] = value;
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]): void {
  for (const child of children.flat(Infinity as 1) as Child[]) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
}

export function clear(el: Element, ...children: Child[]): void {
  el.replaceChildren();
  append(el, children);
}

export function toast(message: string, kind: 'info' | 'error' = 'info'): void {
  const box = document.getElementById('toasts')!;
  const t = h(
    'div',
    { class: `toast ${kind === 'error' ? 'error' : ''}`, role: 'status' },
    message,
  );
  box.append(t);
  setTimeout(() => t.remove(), 4000);
}

export function modal(...content: Child[]): () => void {
  const close = () => bg.remove();
  const bg = h(
    'div',
    { class: 'modal-bg', onclick: (e: Event) => e.target === bg && close() },
    h('div', { class: 'modal card stack' }, ...content),
  );
  document.body.append(bg);
  return close;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function loading(): HTMLElement {
  return h('div', { class: 'loading' }, 'Chargement…');
}
