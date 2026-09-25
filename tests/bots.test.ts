import { describe, expect, it } from 'vitest';
import {
  Game,
  START_FEN,
  moveToUci,
  parseFen,
  positionKey,
  applyMove,
  parseMove,
} from '../src/engine';
import {
  BOT_PRESETS,
  DEFAULT_CONFIG,
  EvalContext,
  HEURISTICS,
  MATE,
  chooseMove,
  estimateStrength,
  evaluate,
  getHeuristic,
  normalizeBotConfig,
  registerHeuristic,
  resolveHeuristics,
  seededRandom,
  type BotConfig,
} from '../src/bots';

const ctx = (fen: string) => new EvalContext(parseFen(fen));
const score = (id: string, fen: string) => getHeuristic(id)!.evaluate(ctx(fen));
const cfg = (partial: Partial<BotConfig>): BotConfig => ({ ...DEFAULT_CONFIG, ...partial });

describe('EvalContext', () => {
  it('caches moves, phase and attack maps', () => {
    const c = ctx(START_FEN);
    expect(c.moves('w')).toBe(c.moves('w'));
    expect(c.moves('b')).toHaveLength(20);
    expect(c.phase()).toBe(1);
    expect(c.phase()).toBe(1);
    expect(c.material()).toBe(0);
    const attacks = c.attacks('w');
    expect(c.attacks('w')).toBe(attacks);
    expect(attacks.count[16]).toBe(2); // a3: b2 pawn + b1 knight
    expect(attacks.cheapest[16]).toBe(100);
    expect(attacks.cheapest[40]).toBe(Infinity);
    const k = ctx('4k3/8/8/8/8/8/8/1B1QK2R w - - 0 1').attacks('w');
    expect(k.cheapest[10]).toBe(330); // c2: bishop b1 and queen d1
    expect(k.cheapest[5]).toBe(500); // f1: rook h1 and king e1
  });
});

describe('heuristics', () => {
  it('have unique ids and metadata', () => {
    const ids = HEURISTICS.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const h of HEURISTICS) {
      expect(h.name && h.icon && h.description).toBeTruthy();
      expect(h.evaluate(ctx(START_FEN))).toBeCloseTo(0, 5);
    }
  });

  it('material counts pieces', () => {
    expect(score('material', '4k3/8/8/8/8/8/8/3QK3 w - - 0 1')).toBe(900);
  });

  it('positional prefers central knights and active endgame kings', () => {
    expect(score('positional', '4k3/8/8/8/3N4/8/8/4K3 w - - 0 1')).toBeGreaterThan(
      score('positional', '4k3/8/8/8/8/8/8/N3K3 w - - 0 1'),
    );
    expect(score('positional', '8/8/8/3k4/8/8/8/K7 w - - 0 1')).toBeLessThan(0);
  });

  it('mobility rewards more moves', () => {
    expect(score('mobility', '4k3/8/8/8/8/8/8/Q3K3 w - - 0 1')).toBeGreaterThan(0);
  });

  it('safety punishes hanging and under-defended pieces', () => {
    // black queen attacked by a pawn, black to move -> smaller penalty than when white to move
    const toMove = score('safety', '4k3/8/8/3q4/4P3/8/8/4K3 b - - 0 1');
    const waiting = score('safety', '4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1');
    expect(toMove).toBeGreaterThan(0);
    expect(waiting).toBeGreaterThan(toMove);
    // defended rook attacked only by a queen: no threat
    expect(score('safety', '4k3/8/4p3/3r4/8/8/Q7/4K3 w - - 0 1')).toBe(0);
    // piece attacked only by an enemy king and defended is safe
    expect(score('safety', '8/8/8/8/8/2k5/1P6/2K5 w - - 0 1')).toBeLessThanOrEqual(0);
  });

  it('center rewards central pawns', () => {
    expect(score('center', '4k3/8/8/8/3PP3/8/8/4K3 w - - 0 1')).toBeGreaterThan(0);
    expect(score('center', '4k3/8/8/3n4/8/8/8/4K3 w - - 0 1')).toBeLessThan(0);
  });

  it('kingSafety likes pawn shields', () => {
    expect(score('kingSafety', '6k1/8/8/8/8/8/5PPP/6K1 w - - 0 1')).toBeGreaterThan(0);
    expect(score('kingSafety', '7k/8/8/8/8/8/8/6K1 w - - 0 1')).toBe(0);
    expect(score('kingSafety', '7k/8/8/8/8/6P1/7p/6K1 w - - 0 1')).toBeGreaterThan(
      score('kingSafety', '7k/8/8/8/8/8/7p/6K1 w - - 0 1'),
    );
    expect(score('kingSafety', 'k7/8/8/8/8/8/8/7K w - - 0 1')).toBe(0);
  });

  it('pawnStructure evaluates doubled, isolated and passed pawns', () => {
    expect(score('pawnStructure', '4k3/8/8/8/8/P7/P7/4K3 w - - 0 1')).toBeLessThan(
      score('pawnStructure', '4k3/8/8/8/8/8/PP6/4K3 w - - 0 1'),
    );
    expect(score('pawnStructure', '4k3/P7/8/8/8/8/8/4K3 w - - 0 1')).toBeGreaterThan(
      score('pawnStructure', '4k3/8/8/8/8/8/P7/4K3 w - - 0 1'),
    );
    expect(score('pawnStructure', '4k3/p7/8/8/8/8/1P6/4K3 w - - 0 1')).toBe(0);
    expect(score('pawnStructure', '4k3/8/8/8/8/8/7p/4K3 w - - 0 1')).toBeLessThan(-100);
  });

  it('development rewards castling and punishes early queen / wandering king', () => {
    const castled = 'rnbqkbnr/pppppppp/8/8/8/5NP1/PPPPPPBP/RNBQ1RK1 w kq - 0 1';
    const home = 'rnbqkbnr/pppppppp/8/8/8/5NP1/PPPPPPBP/RNBQK2R w KQkq - 0 1';
    const wander = 'rnbqkbnr/pppppppp/8/8/8/5NP1/PPPPPPBP/RNBQ1K1R w kq - 0 1';
    const queen = 'rnbqkbnr/pppppppp/8/8/7Q/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1';
    expect(score('development', castled)).toBeGreaterThan(score('development', home));
    expect(score('development', wander)).toBeLessThan(score('development', home));
    expect(score('development', queen)).toBeLessThan(0);
  });

  it('aggression likes attacking pieces and giving check', () => {
    expect(score('aggression', '4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1')).toBeGreaterThan(0);
    expect(score('aggression', '4k3/8/8/8/8/8/8/R3K2r w - - 0 1')).toBeLessThan(0);
  });

  it('endgame pushes the losing king to the edge', () => {
    const edge = score('endgame', '7k/8/5K2/8/8/8/8/R7 w - - 0 1');
    const middle = score('endgame', '8/8/8/3k4/8/8/8/R3K3 w - - 0 1');
    expect(edge).toBeGreaterThan(middle);
    expect(score('endgame', 'r7/8/8/8/8/8/8/K6k w - - 0 1')).toBeLessThan(0);
    expect(score('endgame', START_FEN)).toBe(0);
  });

  it('can register new reasoning types', () => {
    const custom = { id: 'test-custom', name: 'T', icon: 'T', description: 'd', evaluate: () => 7 };
    registerHeuristic(custom);
    expect(getHeuristic('test-custom')).toBe(custom);
    expect(() => registerHeuristic(custom)).toThrow('already registered');
  });
});

describe('bot config', () => {
  it('normalises untrusted input', () => {
    expect(normalizeBotConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(
      normalizeBotConfig({
        heuristics: [
          { id: 'material', weight: 9 },
          { id: 'material', weight: 1 },
          { id: 'nope', weight: 1 },
          { id: 'center', weight: 0 },
          { id: 'safety', weight: 'x' },
          null,
          { id: 'mobility', weight: 1.234 },
        ],
        depth: 42,
        quiescence: true,
        randomness: -5,
      }),
    ).toEqual({
      heuristics: [
        { id: 'material', weight: 3 },
        { id: 'safety', weight: 1 },
        { id: 'mobility', weight: 1.23 },
      ],
      depth: 5,
      quiescence: true,
      randomness: 0,
    });
    expect(normalizeBotConfig({ heuristics: 'x', depth: NaN, randomness: 50 }).randomness).toBe(50);
  });

  it('estimates strength', () => {
    expect(estimateStrength(DEFAULT_CONFIG)).toBeGreaterThan(900);
    expect(estimateStrength({ ...DEFAULT_CONFIG, randomness: 1000 })).toBe(400);
    const gm = BOT_PRESETS.find((p) => p.key === 'grand-maitre')!;
    expect(estimateStrength(gm.config)).toBeGreaterThan(estimateStrength(DEFAULT_CONFIG));
  });

  it('presets are valid configs', () => {
    for (const p of BOT_PRESETS) expect(normalizeBotConfig(p.config)).toEqual(p.config);
  });
});

describe('search', () => {
  it('finds mate in one at depth 1, with or without quiescence', () => {
    for (const quiescence of [false, true]) {
      const r = chooseMove(
        parseFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'),
        cfg({ depth: 1, quiescence }),
      );
      expect(moveToUci(r.move!)).toBe('a1a8');
      expect(r.score).toBe(MATE - 1);
    }
  });

  it('finds a mate in two at depth 3', () => {
    const r = chooseMove(parseFen('7k/8/8/8/8/8/R7/1R4K1 w - - 0 1'), cfg({ depth: 3 }));
    expect(r.score).toBe(MATE - 3);
  });

  it('grabs a hanging queen and sees through exchanges with quiescence', () => {
    const r = chooseMove(parseFen('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1'), cfg({ depth: 1 }));
    expect(moveToUci(r.move!)).toBe('e4d5');
    // Qxd5?? loses the queen to exd5: depth 1 + quiescence avoids it
    const pos = parseFen('4k3/8/4p3/3p4/8/8/8/3QK3 w - - 0 1');
    const greedy = chooseMove(pos, cfg({ depth: 1 }));
    const careful = chooseMove(pos, cfg({ depth: 1, quiescence: true }));
    expect(moveToUci(greedy.move!)).toBe('d1d5');
    expect(moveToUci(careful.move!)).not.toBe('d1d5');
  });

  it('returns no move when the game is over', () => {
    const mated = chooseMove(parseFen('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1'), DEFAULT_CONFIG);
    expect(mated).toMatchObject({ move: null, score: -MATE, candidates: [] });
    const stale = chooseMove(parseFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), DEFAULT_CONFIG);
    expect(stale.score).toBe(0);
  });

  it('scores draws by rule as zero', () => {
    const fifty = chooseMove(parseFen('7k/8/6K1/8/8/8/8/R7 w - - 99 80'), cfg({ depth: 2 }));
    expect(fifty.candidates.some((c) => c.score === 0)).toBe(true);
    const stalemate = chooseMove(parseFen('7k/8/5K2/8/8/8/8/6Q1 w - - 0 1'), cfg({ depth: 2 }));
    expect(stalemate.candidates.find((c) => c.uci === 'g1g6')!.score).toBe(0);
    const bare = chooseMove(parseFen('7k/8/6K1/8/8/8/8/8 w - - 0 1'), cfg({ depth: 2 }));
    expect(bare.candidates.every((c) => c.score === 0)).toBe(true);
  });

  it('uses randomness to vary its play, except for mates', () => {
    const pos = parseFen(START_FEN);
    const loose = cfg({ depth: 1, randomness: 1000 });
    const picks = new Set(
      [0, 0.3, 0.6, 0.99].map((x) => moveToUci(chooseMove(pos, loose, { rng: () => x }).move!)),
    );
    expect(picks.size).toBeGreaterThan(1);
    const mate = chooseMove(parseFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'), loose, {
      rng: () => 0.99,
    });
    expect(moveToUci(mate.move!)).toBe('a1a8');
  });

  it('respects node budgets', () => {
    const pos = parseFen('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4');
    const tiny = chooseMove(pos, cfg({ depth: 4, quiescence: true }), { maxNodes: 50 });
    const noQ = chooseMove(pos, cfg({ depth: 3 }), { maxNodes: 50 });
    expect(tiny.move).not.toBeNull();
    expect(noQ.nodes).toBeLessThan(200);
  });

  it('treats repeated positions as draws', () => {
    const pos = parseFen('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
    const repeat = positionKey(applyMove(pos, parseMove(pos, 'Ra8')!));
    const r = chooseMove(pos, cfg({ depth: 1 }), { seenPositions: [repeat] });
    expect(r.candidates.find((c) => c.uci === 'a1a8')!.score).toBe(0);
  });

  it('evaluates from the side to move and ignores unknown heuristics', () => {
    const weighted = resolveHeuristics(
      cfg({
        heuristics: [
          { id: 'material', weight: 1 },
          { id: 'zzz', weight: 1 },
        ],
      }),
    );
    expect(weighted).toHaveLength(1);
    expect(evaluate(parseFen('4k3/8/8/8/8/8/8/3QK3 b - - 0 1'), weighted)).toBe(-900);
  });

  it('is reproducible with a seeded rng and plays full games', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    const g = new Game();
    const rng = seededRandom(7);
    const bot = BOT_PRESETS[0].config;
    while (!g.status().over && g.history().length < 60) {
      g.move(
        moveToUci(chooseMove(g.position, bot, { rng, seenPositions: g.positionKeys() }).move!),
      );
    }
    expect(g.history().length).toBeGreaterThan(0);
  });
});
