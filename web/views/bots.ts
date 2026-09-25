import type { PlayerRecord } from '../../src/arena/types';
import {
  DEFAULT_CONFIG,
  LIMITS,
  estimateStrength,
  normalizeBotConfig,
  type BotConfig,
} from '../../src/bots/config';
import type { BotPreset } from '../../src/bots/presets';
import { clear, errorMessage, h, loading, toast } from '../dom';
import { savePrefs, state } from '../state';

const AVATARS = [
  '🤖',
  '🦾',
  '🧠',
  '⚡',
  '🐙',
  '🦊',
  '🐉',
  '🦉',
  '👾',
  '🐺',
  '🦁',
  '🐢',
  '🪓',
  '🛡️',
  '🎯',
  '🏆',
  '💰',
  '🐣',
  '🔥',
  '❄️',
];

function heuristicName(id: string): string {
  const info = state.heuristics.find((x) => x.id === id);
  return info ? `${info.icon} ${info.name}` : id;
}

function configChips(config: BotConfig): HTMLElement {
  return h(
    'div',
    { class: 'row' },
    config.heuristics.map((x) =>
      h(
        'span',
        { class: 'chip', title: `poids ${x.weight}` },
        heuristicName(x.id),
        x.weight !== 1 ? h('span', { class: 'muted' }, ` ×${x.weight}`) : null,
      ),
    ),
    h('span', { class: 'chip gold' }, `👁️ ${config.depth} demi-coup${config.depth > 1 ? 's' : ''}`),
    config.quiescence ? h('span', { class: 'chip gold' }, '💥 Échanges') : null,
    config.randomness ? h('span', { class: 'chip' }, `🎲 ±${config.randomness}`) : null,
  );
}

export async function botsView(el: HTMLElement): Promise<void> {
  clear(el, loading());
  const bots = await state.api.players('bot');
  bots.sort((a, b) => b.rating - a.rating);
  clear(
    el,
    h(
      'div',
      { class: 'row' },
      h('h1', null, '🤖 Atelier des bots'),
      h('span', { class: 'spacer' }),
      h('a', { class: 'btn primary', href: '#/bots/new' }, '➕ Créer un bot'),
    ),
    h(
      'p',
      { class: 'muted' },
      'Chaque bot combine un ou plusieurs types de réflexion (calculs), pondérés, avec une profondeur de vision. À chaque coup il explore les coups possibles, évalue les positions obtenues avec ses calculs et joue le meilleur.',
    ),
    h(
      'div',
      { class: 'grid grid-2' },
      bots.map((b) =>
        h(
          'div',
          { class: 'card bot-card' },
          h(
            'div',
            { class: 'head' },
            h('span', { class: 'avatar' }, b.bot!.avatar),
            h(
              'div',
              null,
              h('h2', { style: 'margin:0' }, b.name),
              h(
                'div',
                { class: 'small muted' },
                `Elo ${b.rating} · ${b.games} parties · ${b.wins}V ${b.draws}N ${b.losses}D`,
                b.ranked ? '' : ' · non classé',
              ),
            ),
          ),
          b.bot!.description
            ? h('p', { class: 'muted small', style: 'margin:0' }, b.bot!.description)
            : null,
          configChips(b.bot!.config),
          h(
            'div',
            { class: 'row' },
            h(
              'button',
              {
                class: 'btn small primary',
                onclick: () => (savePrefs({ 'pve-bot': b.id }), (location.hash = '#/new/pve')),
              },
              '⚔️ Affronter',
            ),
            h('a', { class: 'btn small', href: `#/bots/edit/${b.id}` }, '✏️ Modifier'),
            h('a', { class: 'btn small ghost', href: `#/player/${b.id}` }, '📊 Profil'),
          ),
        ),
      ),
    ),
  );
}

export async function botEditorView(el: HTMLElement, params: string[]): Promise<void> {
  clear(el, loading());
  const editing: PlayerRecord | null = params[0]
    ? (await state.api.profile(params[0])).player
    : null;
  const presets: BotPreset[] = await state.api.presets();
  let config: BotConfig = structuredClone(editing?.bot?.config ?? DEFAULT_CONFIG);
  let avatar = editing?.bot?.avatar ?? '🤖';
  let preset = editing?.bot?.preset;

  const name = h('input', {
    type: 'text',
    value: editing?.name ?? '',
    maxlength: 24,
    placeholder: 'Ex. : Le Renard',
  });
  const description = h(
    'textarea',
    { rows: 2, maxlength: 200, placeholder: 'Sa personnalité, son style…' },
    editing?.bot?.description ?? '',
  );
  const ranked = h('input', { type: 'checkbox', checked: editing?.ranked ?? true });
  const avatarsBox = h('div', { class: 'avatars' });
  const heuristicsBox = h('div', { class: 'grid grid-2' });
  const searchBox = h('div', { class: 'grid grid-2' });
  const estimate = h('b', { style: 'color:var(--gold-2)' });

  const renderAvatars = () =>
    clear(
      avatarsBox,
      AVATARS.map((a) =>
        h(
          'button',
          {
            type: 'button',
            class: a === avatar ? 'active' : '',
            onclick: () => ((avatar = a), renderAvatars()),
          },
          a,
        ),
      ),
    );

  const update = () => {
    config = normalizeBotConfig(config);
    estimate.textContent = `≈ ${estimateStrength(config)} Elo`;
  };

  function renderHeuristics() {
    clear(
      heuristicsBox,
      state.heuristics.map((info) => {
        const current = config.heuristics.find((x) => x.id === info.id);
        const toggle = h('input', {
          type: 'checkbox',
          checked: !!current,
          'aria-label': info.name,
        });
        const weight = h('input', {
          type: 'range',
          min: 0.1,
          max: LIMITS.weight.max,
          step: 0.1,
          value: String(current?.weight ?? 1),
          disabled: !current,
        });
        const weightLabel = h(
          'span',
          { class: 'small', style: 'min-width:2.5rem' },
          `×${current?.weight ?? 1}`,
        );
        toggle.addEventListener('change', () => {
          config.heuristics = toggle.checked
            ? [...config.heuristics, { id: info.id, weight: Number(weight.value) }]
            : config.heuristics.filter((x) => x.id !== info.id);
          if (!config.heuristics.length) {
            toast('Un bot doit avoir au moins un calcul', 'error');
            config.heuristics = [{ id: info.id, weight: 1 }];
          }
          update();
          renderHeuristics();
        });
        weight.addEventListener('input', () => {
          const entry = config.heuristics.find((x) => x.id === info.id);
          if (entry) entry.weight = Number(weight.value);
          weightLabel.textContent = `×${weight.value}`;
          update();
        });
        return h(
          'label',
          { class: `heuristic ${current ? 'on' : ''}` },
          toggle,
          h('b', null, `${info.icon} ${info.name}`),
          h('span', { class: 'desc' }, info.description),
          h(
            'span',
            { class: 'weight' },
            h('span', { class: 'small muted' }, 'Poids'),
            weight,
            weightLabel,
          ),
        );
      }),
    );
  }

  function renderSearch() {
    const depth = h('input', {
      type: 'range',
      min: LIMITS.depth.min,
      max: LIMITS.depth.max,
      step: 1,
      value: String(config.depth),
    });
    const depthLabel = h('b');
    const setDepthLabel = () =>
      (depthLabel.textContent = `${config.depth} demi-coup${config.depth > 1 ? 's' : ''} (${['', 'réagit au coup', 'voit la réponse adverse', 'voit 2 coups d’avance', 'voit 2 coups + réponse', 'voit 3 coups d’avance'][config.depth]})`);
    setDepthLabel();
    depth.addEventListener('input', () => {
      config.depth = Number(depth.value);
      setDepthLabel();
      update();
    });
    const quiescence = h('input', { type: 'checkbox', checked: config.quiescence });
    quiescence.addEventListener(
      'change',
      () => ((config.quiescence = quiescence.checked), update()),
    );
    const randomness = h('input', {
      type: 'range',
      min: 0,
      max: 500,
      step: 10,
      value: String(config.randomness),
    });
    const randLabel = h(
      'b',
      null,
      config.randomness
        ? `±${config.randomness} centipions`
        : 'Aucun (joue toujours le meilleur coup)',
    );
    randomness.addEventListener('input', () => {
      config.randomness = Number(randomness.value);
      randLabel.textContent = config.randomness
        ? `±${config.randomness} centipions`
        : 'Aucun (joue toujours le meilleur coup)';
      update();
    });
    clear(
      searchBox,
      h(
        'div',
        { class: 'heuristic on' },
        h('span', null, '👁️'),
        h('b', null, 'Voir plusieurs coups d’avance'),
        h(
          'span',
          { class: 'desc' },
          'Profondeur de l’arbre de calcul (alpha-bêta). Plus c’est profond, plus c’est fort… et lent.',
        ),
        h('span', { class: 'weight' }, depth),
        h('span', { class: 'desc' }, depthLabel),
      ),
      h(
        'label',
        { class: `heuristic ${config.quiescence ? 'on' : ''}` },
        quiescence,
        h('b', null, '💥 Calcul des échanges (quiescence)'),
        h(
          'span',
          { class: 'desc' },
          'Poursuit le calcul tant qu’il reste des captures, pour ne jamais s’arrêter au milieu d’un échange.',
        ),
      ),
      h(
        'div',
        { class: 'heuristic' },
        h('span', null, '🎲'),
        h('b', null, 'Part d’imprévu'),
        h(
          'span',
          { class: 'desc' },
          'Tout coup à moins de cette marge du meilleur peut être choisi au hasard : rend le bot plus humain (et plus faible).',
        ),
        h('span', { class: 'weight' }, randomness),
        h('span', { class: 'desc' }, randLabel),
      ),
    );
  }

  const presetSelect = h(
    'select',
    { 'aria-label': 'Partir d’un modèle' },
    h('option', { value: '' }, '— Partir d’un modèle —'),
    presets.map((p) => h('option', { value: p.key }, `${p.avatar} ${p.name}`)),
  );
  presetSelect.addEventListener('change', () => {
    const p = presets.find((x) => x.key === presetSelect.value);
    if (!p) return;
    config = structuredClone(p.config);
    avatar = p.avatar;
    preset = p.key;
    if (!description.value) description.value = p.description;
    renderAvatars();
    renderHeuristics();
    renderSearch();
    update();
  });

  async function save() {
    const bot = { avatar, description: description.value, config, preset };
    try {
      const saved = editing
        ? await state.api.updatePlayer(editing.id, {
            name: name.value,
            ranked: ranked.checked,
            bot,
          })
        : await state.api.createPlayer({
            name: name.value,
            kind: 'bot',
            ranked: ranked.checked,
            bot,
          });
      toast(`Bot « ${saved.name} » enregistré`);
      location.hash = '#/bots';
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }

  async function remove() {
    if (
      !editing ||
      !confirm(
        `Supprimer définitivement « ${editing.name} » ? Ses parties restent dans l’historique.`,
      )
    )
      return;
    await state.api.deletePlayer(editing.id);
    toast('Bot supprimé');
    location.hash = '#/bots';
  }

  renderAvatars();
  renderHeuristics();
  renderSearch();
  update();
  clear(
    el,
    h(
      'div',
      { class: 'row' },
      h('h1', null, editing ? `✏️ Modifier ${editing.name}` : '➕ Nouveau bot'),
      h('span', { class: 'spacer' }),
      presetSelect,
    ),
    h(
      'div',
      { class: 'card stack' },
      h(
        'div',
        { class: 'grid grid-2' },
        h('div', { class: 'field' }, h('label', null, 'Nom'), name),
        h('div', { class: 'field' }, h('label', null, 'Description'), description),
      ),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Avatar'), avatarsBox),
      h('label', { class: 'row' }, ranked, 'Apparaît dans le classement (parties classées)'),
    ),
    h('h2', { style: 'margin-top:1.5rem' }, '🧮 Types de réflexion (calculs)'),
    h(
      'p',
      { class: 'muted small' },
      'Cochez les calculs que le bot utilise pour juger une position, et réglez leur importance.',
    ),
    heuristicsBox,
    h('h2', { style: 'margin-top:1.5rem' }, '🔭 Recherche'),
    searchBox,
    h(
      'div',
      { class: 'row card', style: 'margin-top:1.5rem; position:sticky; bottom:4.5rem' },
      h('span', null, 'Force estimée : ', estimate),
      h('span', { class: 'spacer' }),
      editing ? h('button', { class: 'btn danger', onclick: remove }, '🗑 Supprimer') : null,
      h('a', { class: 'btn ghost', href: '#/bots' }, 'Annuler'),
      h('button', { class: 'btn primary', onclick: save }, '💾 Enregistrer'),
    ),
  );
}
