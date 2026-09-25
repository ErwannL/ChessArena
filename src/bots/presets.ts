import type { BotConfig } from './config';

export interface BotPreset {
  key: string;
  name: string;
  avatar: string;
  description: string;
  config: BotConfig;
}

const w = (...ids: [string, number][]) => ids.map(([id, weight]) => ({ id, weight }));

export const BOT_PRESETS: BotPreset[] = [
  {
    key: 'pousse-bois',
    name: 'Pousse-Bois',
    avatar: '🐣',
    description: 'Joue presque au hasard, mais prend ce qui traîne.',
    config: { heuristics: w(['material', 1]), depth: 1, quiescence: false, randomness: 400 },
  },
  {
    key: 'materialiste',
    name: 'Le Matérialiste',
    avatar: '💰',
    description: 'Ne pense qu’à compter les pièces, 2 coups à l’avance.',
    config: { heuristics: w(['material', 1]), depth: 2, quiescence: false, randomness: 20 },
  },
  {
    key: 'gardien',
    name: 'Le Gardien',
    avatar: '🛡️',
    description: 'Protège ses pièces avant tout et ne laisse rien en prise.',
    config: {
      heuristics: w(['material', 1], ['safety', 1.5], ['kingSafety', 1]),
      depth: 2,
      quiescence: true,
      randomness: 10,
    },
  },
  {
    key: 'berserker',
    name: 'Berserker',
    avatar: '🪓',
    description: 'Attaque tout ce qui bouge, quitte à se découvrir.',
    config: {
      heuristics: w(['material', 1], ['aggression', 2.5], ['mobility', 1]),
      depth: 2,
      quiescence: false,
      randomness: 40,
    },
  },
  {
    key: 'stratege',
    name: 'Le Stratège',
    avatar: '🧠',
    description: 'Joue positionnel : centre, développement, structure de pions.',
    config: {
      heuristics: w(
        ['material', 1],
        ['positional', 1],
        ['center', 1],
        ['development', 1],
        ['pawnStructure', 1],
      ),
      depth: 2,
      quiescence: true,
      randomness: 0,
    },
  },
  {
    key: 'tacticien',
    name: 'Le Tacticien',
    avatar: '⚡',
    description: 'Calcule 3 coups à l’avance et résout les échanges jusqu’au bout.',
    config: {
      heuristics: w(['material', 1], ['positional', 0.5], ['safety', 1]),
      depth: 3,
      quiescence: true,
      randomness: 0,
    },
  },
  {
    key: 'grand-maitre',
    name: 'Grand Maître',
    avatar: '🏆',
    description: 'Combine tous les calculs avec une vision profonde.',
    config: {
      heuristics: w(
        ['material', 1],
        ['positional', 1],
        ['mobility', 0.5],
        ['safety', 0.5],
        ['center', 0.5],
        ['kingSafety', 0.8],
        ['pawnStructure', 0.8],
        ['development', 0.8],
        ['endgame', 1],
      ),
      depth: 3,
      quiescence: true,
      randomness: 0,
    },
  },
];
