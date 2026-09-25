import { describe, expect, it } from 'vitest';
import {
  RATING_FLOOR,
  expectedScore,
  kFactor,
  performanceRating,
  rateGame,
  resultToScore,
} from '../src/rating';

describe('Elo', () => {
  it('computes expected scores', () => {
    expect(expectedScore(1500, 1500)).toBe(0.5);
    expect(expectedScore(1900, 1500)).toBeCloseTo(0.909, 3);
  });

  it('uses FIDE-like K factors', () => {
    expect(kFactor(1500, 5)).toBe(40);
    expect(kFactor(1500, 50)).toBe(20);
    expect(kFactor(2500, 50)).toBe(10);
  });

  it('rates games symmetrically', () => {
    const r = rateGame({ rating: 1500, games: 50 }, { rating: 1500, games: 50 }, 1);
    expect(r).toEqual({ white: 1510, black: 1490, whiteDelta: 10, blackDelta: -10 });
    const draw = rateGame({ rating: 1600, games: 50 }, { rating: 1400, games: 50 }, 0.5);
    expect(draw.whiteDelta).toBeLessThan(0);
    expect(draw.blackDelta).toBeGreaterThan(0);
  });

  it('never goes below the floor', () => {
    const r = rateGame({ rating: RATING_FLOOR, games: 0 }, { rating: 100, games: 0 }, 0);
    expect(r.white).toBe(RATING_FLOOR);
    expect(r.whiteDelta).toBe(0);
  });

  it('maps results and performance', () => {
    expect(resultToScore('1-0')).toBe(1);
    expect(resultToScore('0-1')).toBe(0);
    expect(resultToScore('1/2-1/2')).toBe(0.5);
    expect(resultToScore('*')).toBeNull();
    expect(performanceRating(0, 0, 0, 0)).toBeNull();
    expect(performanceRating(3000, 2, 2, 0)).toBe(1900);
  });
});
