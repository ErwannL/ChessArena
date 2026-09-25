import type { Result } from '../engine/types';

export const DEFAULT_RATING = 1200;
export const RATING_FLOOR = 100;

/** Probability-like expected score of A against B. */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/** FIDE-like K factor: provisional players move faster, elite players slower. */
export function kFactor(rating: number, games: number): number {
  if (games < 30) return 40;
  if (rating >= 2400) return 10;
  return 20;
}

export interface Rated {
  rating: number;
  games: number;
}

export interface EloOutcome {
  white: number;
  black: number;
  whiteDelta: number;
  blackDelta: number;
}

/** New ratings after a game. `whiteScore` is 1, 0.5 or 0. */
export function rateGame(white: Rated, black: Rated, whiteScore: number): EloOutcome {
  const expected = expectedScore(white.rating, black.rating);
  const whiteDelta = Math.round(kFactor(white.rating, white.games) * (whiteScore - expected));
  const blackDelta = Math.round(
    kFactor(black.rating, black.games) * (1 - whiteScore - (1 - expected)),
  );
  const whiteNew = Math.max(RATING_FLOOR, white.rating + whiteDelta);
  const blackNew = Math.max(RATING_FLOOR, black.rating + blackDelta);
  return {
    white: whiteNew,
    black: blackNew,
    whiteDelta: whiteNew - white.rating,
    blackDelta: blackNew - black.rating,
  };
}

export function resultToScore(result: Result): number | null {
  if (result === '1-0') return 1;
  if (result === '0-1') return 0;
  if (result === '1/2-1/2') return 0.5;
  return null;
}

/** Linear performance rating: average opposition ± 400 × (wins − losses) / games. */
export function performanceRating(
  opponentsRatingSum: number,
  games: number,
  wins: number,
  losses: number,
): number | null {
  if (!games) return null;
  return Math.round(opponentsRatingSum / games + (400 * (wins - losses)) / games);
}
