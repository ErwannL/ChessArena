import type { EndReason, Result } from '../engine/types';

export const REASON_LABELS: Record<EndReason, string> = {
  checkmate: 'Échec et mat',
  stalemate: 'Pat',
  'fifty-move': 'Règle des 50 coups',
  threefold: 'Triple répétition',
  'insufficient-material': 'Matériel insuffisant',
  resignation: 'Abandon',
  agreement: 'Nulle par accord',
};

export function resultLabel(result: Result, white: string, black: string): string {
  if (result === '1-0') return `${white} gagne`;
  if (result === '0-1') return `${black} gagne`;
  if (result === '1/2-1/2') return 'Partie nulle';
  return 'En cours';
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/** Centipawns → "+1.25" pawns, or "#3" for mates. */
export function formatEval(cp: number, mate = 100_000): string {
  if (Math.abs(cp) >= mate - 1000) {
    const plies = mate - Math.abs(cp);
    return `${cp > 0 ? '' : '-'}#${Math.ceil(plies / 2)}`;
  }
  return signed(Math.round(cp) / 100);
}

export function relativeTime(at: number | null, now = Date.now()): string {
  if (at === null) return 'jamais';
  const s = Math.round((now - at) / 1000);
  if (s < 60) return 'à l’instant';
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `il y a ${d} j`;
  return new Date(at).toLocaleDateString('fr-FR');
}

export function percent(part: number, total: number): string {
  return total ? `${Math.round((part / total) * 100)}%` : '–';
}
