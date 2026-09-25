import { describe, expect, it } from 'vitest';
import {
  Game,
  START_FEN,
  applyMove,
  attackersOf,
  charToPiece,
  findKing,
  inCheck,
  isInsufficientMaterial,
  isLightSquare,
  legalMoves,
  moveOrderScore,
  moveToUci,
  offset,
  parseFen,
  parseMove,
  parseSquare,
  piece,
  positionKey,
  squareName,
  toFen,
  toSan,
  withTurn,
  type Position,
} from '../src/engine';

function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  const moves = legalMoves(pos);
  if (depth === 1) return moves.length;
  return moves.reduce((n, m) => n + perft(applyMove(pos, m), depth - 1), 0);
}

describe('board helpers', () => {
  it('converts squares', () => {
    expect(squareName(0)).toBe('a1');
    expect(squareName(63)).toBe('h8');
    expect(parseSquare('e4')).toBe(28);
    expect(() => parseSquare('z9')).toThrow('Invalid square');
    expect(offset(0, -1, 0)).toBe(-1);
    expect(offset(0, 1, 1)).toBe(9);
    expect(isLightSquare(parseSquare('h1'))).toBe(true);
    expect(isLightSquare(parseSquare('a1'))).toBe(false);
  });

  it('caches pieces and parses chars', () => {
    expect(piece('q', 'w')).toBe(piece('q', 'w'));
    expect(charToPiece('K')).toEqual({ type: 'k', color: 'w' });
    expect(charToPiece('x')).toBeNull();
    expect(charToPiece('')).toBeNull();
  });
});

describe('FEN', () => {
  it('round-trips positions', () => {
    for (const fen of [
      START_FEN,
      'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
      '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 3',
    ]) {
      expect(toFen(parseFen(fen))).toBe(fen);
    }
    expect(toFen(parseFen('4k3/8/8/8/8/8/8/4K3 b - -'))).toBe('4k3/8/8/8/8/8/8/4K3 b - - 0 1');
  });

  it.each([
    ['8/8/8 w - - 0 1', '8 ranks'],
    ['4k3/8/8/8/8/8/8/4K3 w -', '4 or 6'],
    ['4k3/8/8/8/8/8/8/4KX2 w - - 0 1', 'Invalid FEN piece'],
    ['4k3/8/8/8/8/8/8/4K4 w - - 0 1', 'does not have 8 files'],
    ['4k3/8/8/8/8/8/8/8K w - - 0 1', 'overflow'],
    ['4k3/8/8/8/8/8/8/8 w - - 0 1', 'one w king'],
    ['4k3/8/8/8/8/8/8/4K3 x - - 0 1', 'side to move'],
    ['4k3/8/8/8/8/8/8/4K3 w KX - 0 1', 'castling'],
    ['4k3/8/8/8/8/8/8/4K3 w - - -1 1', 'counters'],
    ['4k3/8/8/8/8/8/8/4K3 w - - 0 0', 'counters'],
    ['4k3/8/8/8/8/8/8/4K3 w - - 0 x', 'counters'],
  ])('rejects %s', (fen, msg) => {
    expect(() => parseFen(fen)).toThrow(msg);
  });

  it('only keeps capturable en-passant squares in position keys', () => {
    const capturable = parseFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 3');
    const idle = parseFen('4k3/8/8/3p4/8/8/8/4K3 w - d6 0 3');
    expect(positionKey(capturable)).toContain(' d6');
    expect(positionKey(idle)).toMatch(/ -$/);
    expect(positionKey(parseFen(START_FEN))).toMatch(/ -$/);
    expect(positionKey(parseFen('4k3/8/8/pP6/8/8/8/4K3 w - a6 0 3'))).toContain(' a6');
    expect(positionKey(parseFen('4k3/8/8/pp6/8/8/8/4K3 w - a6 0 3'))).toMatch(/ -$/);
  });
});

describe('move generation (perft)', () => {
  it.each([
    [START_FEN, [20, 400, 8902]],
    ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039]],
    ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812]],
    ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
    ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486]],
    ['r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079]],
  ])('perft %s', (fen, counts) => {
    const pos = parseFen(fen);
    counts.forEach((n, i) => expect(perft(pos, i + 1)).toBe(n));
  });

  it('lists attackers', () => {
    const pos = parseFen('4k3/8/8/3r4/2P1N3/8/3Q4/3RK3 w - - 0 1');
    const d5 = parseSquare('d5');
    expect(attackersOf(pos.board, d5, 'w').map(squareName).sort()).toEqual(['c4', 'd2']);
    expect(attackersOf(pos.board, parseSquare('e4'), 'b').map(squareName)).toEqual([]);
    expect(findKing(pos.board, 'b')).toBe(parseSquare('e8'));
  });

  it('detects check and handles missing kings', () => {
    const pos = parseFen('4k3/8/8/8/8/8/8/4K2r w - - 0 1');
    expect(inCheck(pos)).toBe(true);
    expect(inCheck({ ...pos, board: pos.board.map((p) => (p?.color === 'w' ? null : p)) })).toBe(
      false,
    );
  });

  it('handles castling rights updates and captures on corners', () => {
    let pos = parseFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    pos = applyMove(pos, parseMove(pos, 'Rxa8')!);
    expect(pos.castling).toEqual({ wk: true, wq: false, bk: true, bq: false });
    pos = applyMove(pos, parseMove(pos, 'Ke7')!);
    expect(toFen(pos)).toBe('R6r/4k3/8/8/8/8/8/4K2R w K - 1 2');
    pos = applyMove(pos, parseMove(pos, 'O-O')!);
    expect(toFen(pos)).toBe('R6r/4k3/8/8/8/8/8/5RK1 b - - 2 2');
    const q = parseFen('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1');
    expect(toFen(applyMove(q, parseMove(q, 'O-O-O')!))).toContain('2kr3r');
    expect(toFen(applyMove(q, parseMove(q, 'Kd8')!))).toContain(' KQ ');
  });

  it('forbids castling through check, out of check or without rook', () => {
    const through = parseFen('4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1');
    expect(legalMoves(through).some((m) => m.castle === 'k')).toBe(false);
    expect(legalMoves(through).some((m) => m.castle === 'q')).toBe(true);
    const qThrough = parseFen('4k3/8/8/8/8/8/3r4/R3K2R w KQ - 0 1');
    expect(legalMoves(qThrough).some((m) => m.castle === 'q')).toBe(false);
    const checked = parseFen('4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1');
    expect(legalMoves(checked).some((m) => m.castle)).toBe(false);
    const noRook = parseFen('4k3/8/8/8/8/8/8/4K3 w KQ - 0 1');
    expect(legalMoves(noRook).some((m) => m.castle)).toBe(false);
    const blocked = parseFen('4k3/8/8/8/8/8/8/RN2K1NR w KQ - 0 1');
    expect(legalMoves(blocked).some((m) => m.castle)).toBe(false);
    const qBlocked = parseFen('4k3/8/8/8/8/8/8/R2QK2R w KQ - 0 1');
    expect(legalMoves(qBlocked).filter((m) => m.castle).length).toBe(1);
    const displaced = parseFen('4k3/8/8/8/8/8/8/3K3R w K - 0 1');
    expect(legalMoves(displaced).some((m) => m.castle)).toBe(false);
  });

  it('plays en passant and promotions', () => {
    const pos = parseFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 3');
    const ep = parseMove(pos, 'exd6')!;
    expect(ep.enPassant).toBe(true);
    expect(toFen(applyMove(pos, ep))).toBe('4k3/8/3P4/8/8/8/8/4K3 b - - 0 3');
    const promo = parseFen('1n2k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    const moves = legalMoves(promo).filter((m) => m.promotion);
    expect(moves).toHaveLength(8);
    expect(toFen(applyMove(promo, parseMove(promo, 'axb8=N')!))).toContain('1N2k3');
    const black = parseFen('4k3/8/8/8/8/8/p7/4K3 b - - 0 1');
    expect(moveToUci(parseMove(black, 'a1=Q')!)).toBe('a2a1q');
    expect(moveToUci(parseMove(black, 'Kd7')!)).toBe('e8d7');
  });

  it('computes insufficient material', () => {
    const b = (fen: string) => parseFen(fen).board;
    expect(isInsufficientMaterial(b('4k3/8/8/8/8/8/8/4K3 w - - 0 1'))).toBe(true);
    expect(isInsufficientMaterial(b('4k3/8/8/8/8/8/8/4KN2 w - - 0 1'))).toBe(true);
    expect(isInsufficientMaterial(b('4kb2/8/8/8/8/8/8/2B1K3 w - - 0 1'))).toBe(true);
    expect(isInsufficientMaterial(b('4k1b1/8/8/8/8/8/8/2B1K3 w - - 0 1'))).toBe(false);
    expect(isInsufficientMaterial(b('4kn2/8/8/8/8/8/8/2B1K3 w - - 0 1'))).toBe(false);
    expect(isInsufficientMaterial(b('4k3/8/8/8/8/8/8/3RK3 w - - 0 1'))).toBe(false);
  });

  it('orders moves and changes turn', () => {
    expect(
      moveOrderScore({ from: 0, to: 1, piece: 'p', color: 'w', captured: 'q' }),
    ).toBeGreaterThan(moveOrderScore({ from: 0, to: 1, piece: 'q', color: 'w', captured: 'p' }));
    expect(moveOrderScore({ from: 0, to: 1, piece: 'p', color: 'w', promotion: 'q' })).toBe(5900);
    const pos = parseFen(START_FEN);
    expect(withTurn(pos, 'w')).toBe(pos);
    expect(withTurn(pos, 'b').turn).toBe('b');
  });
});

describe('SAN', () => {
  it('disambiguates moves', () => {
    const files = parseFen('4k3/8/8/8/8/8/4K3/R6R w - - 0 1');
    expect(toSan(files, parseMove(files, 'a1d1')!)).toBe('Rad1');
    const ranks = parseFen('R7/8/7k/8/8/8/8/R3K3 w - - 0 1');
    expect(toSan(ranks, parseMove(ranks, 'a1a4')!)).toBe('R1a4');
    const both = parseFen('4k3/8/8/8/8/Q1Q5/8/Q3K3 w - - 0 1');
    expect(toSan(both, parseMove(both, 'a3b2')!)).toBe('Qa3b2');
    expect(toSan(parseFen(START_FEN), parseMove(parseFen(START_FEN), 'Nf3')!)).toBe('Nf3');
  });

  it('marks check and mate', () => {
    const pos = parseFen('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1');
    expect(toSan(pos, parseMove(pos, 'Ra8')!)).toBe('Ra8#');
    const chk = parseFen('6k1/8/8/8/8/8/8/R3K3 w - - 0 1');
    expect(toSan(chk, parseMove(chk, 'Ra8')!)).toBe('Ra8+');
  });

  it('parses SAN variants and rejects illegal input', () => {
    const pos = parseFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(parseMove(pos, '0-0')?.castle).toBe('k');
    expect(parseMove(pos, 'Rb1!?')?.to).toBe(parseSquare('b1'));
    expect(parseMove(pos, 'Qd4')).toBeNull();
    expect(parseMove(pos, 'e2e4')).toBeNull();
  });
});

describe('Game', () => {
  it('plays a scholar mate and exports PGN', () => {
    const g = new Game();
    for (const m of ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6']) g.move(m);
    expect(g.turn).toBe('w');
    expect(g.movesFrom(parseSquare('h5')).length).toBeGreaterThan(0);
    const mate = g.move({ from: parseSquare('h5'), to: parseSquare('f7') });
    expect(mate.san).toBe('Qxf7#');
    expect(g.inCheck()).toBe(true);
    expect(g.status()).toEqual({ over: true, result: '1-0', reason: 'checkmate', winner: 'w' });
    expect(g.moves()).toEqual([]);
    expect(() => g.move('a3')).toThrow('Game is over');
    expect(g.pgn({ White: 'A "x"', Black: 'B' })).toContain(
      '[White "A \'x\'"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0',
    );
    expect(g.history()).toHaveLength(7);
    expect(g.moveList()[0].san).toBe('e4');
    expect(g.lastMove()?.san).toBe('Qxf7#');
  });

  it('detects a black win (fool mate)', () => {
    const g = new Game();
    for (const m of ['f3', 'e5', 'g4', 'Qh4#']) g.move(m);
    expect(g.status()).toEqual({ over: true, result: '0-1', reason: 'checkmate', winner: 'b' });
  });

  it('undoes moves and rejects illegal moves', () => {
    const g = new Game();
    expect(g.undo()).toBeNull();
    expect(g.lastMove()).toBeNull();
    g.move('e2e4');
    expect(g.undo()?.san).toBe('e4');
    expect(g.fen()).toBe(START_FEN);
    expect(() => g.move('e5')).toThrow('Illegal move');
    expect(() => g.move({ from: 0, to: 40 })).toThrow('Illegal move');
  });

  it('handles promotion inputs', () => {
    const g = new Game('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    expect(g.move({ from: parseSquare('a7'), to: parseSquare('a8') }).promotion).toBe('q');
    g.undo();
    expect(g.move({ from: parseSquare('a7'), to: parseSquare('a8'), promotion: 'n' }).san).toBe(
      'a8=N',
    );
  });

  it('detects stalemate, insufficient material and fifty-move rule', () => {
    expect(new Game('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').status().reason).toBe('stalemate');
    expect(new Game('7k/8/6K1/8/8/8/8/8 b - - 0 1').status().reason).toBe('insufficient-material');
    expect(new Game('7k/8/6K1/8/8/8/8/R7 b - - 100 80').status().reason).toBe('fifty-move');
    expect(new Game('7k/8/6K1/8/8/8/8/R7 b - - 12 80').status().over).toBe(false);
  });

  it('detects threefold repetition', () => {
    const g = new Game();
    for (let i = 0; i < 2; i++) for (const m of ['Nf3', 'Nf6', 'Ng1', 'Ng8']) g.move(m);
    expect(g.repetitionCount()).toBe(3);
    expect(g.positionKeys()).toHaveLength(9);
    expect(g.status().reason).toBe('threefold');
  });

  it('supports resignation, draws and custom start positions', () => {
    const g = new Game('4k3/8/8/8/8/8/8/R3K3 b - - 0 5');
    g.resign('w');
    expect(g.status()).toMatchObject({ result: '0-1', winner: 'b' });
    g.undo();
    g.resign('b');
    expect(g.status().result).toBe('1-0');
    g.undo();
    g.move('Kd7');
    g.agreeDraw();
    const pgn = g.pgn();
    expect(pgn).toContain('[SetUp "1"]');
    expect(pgn).toContain('5... Kd7 1/2-1/2');
  });
});
