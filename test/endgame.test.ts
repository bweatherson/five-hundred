import { describe, expect, it } from "vitest";
import { SUITS, isJoker } from "../src/cards.ts";
import { PlayState, applyPlay, cloneState, dealCards, isHandOver, runAuction, seatToPlay } from "../src/game.ts";
import { DEFAULT_RULES, legalPlays, makeContract, scoreHand, teamOf } from "../src/rules.ts";
import { makeRng } from "../src/rng.ts";
import { makeStrategy } from "../src/registry.ts";
import { solveEndgame } from "../src/strategies/endgame.ts";
import { solveEndgameFast } from "../src/strategies/endgame-fast.ts";
import { continuePlay, viewFor } from "../src/game.ts";

/** Plain minimax over every legal card (and every Joker suit), no pruning. */
function brute(s: PlayState): number {
  if (isHandOver(s)) {
    const p = scoreHand(s.contract, s.teamTricks, s.rules).points;
    return p[0] - p[1];
  }
  const seat = seatToPlay(s);
  const max = teamOf(seat) === 0;
  let best = max ? -Infinity : Infinity;
  for (const c of legalPlays(s.hands[seat], s.ledSuit, s.contract.trump)) {
    const suits = s.ledSuit === null && isJoker(c) && s.contract.trump === null ? SUITS : [undefined];
    for (const js of suits) {
      const n = cloneState(s);
      applyPlay(n, c, js);
      const v = brute(n);
      best = max ? Math.max(best, v) : Math.min(best, v);
    }
  }
  return best;
}

/** Real hands played by `tuned` until `left` tricks remain. */
function positions(count: number, left: number): PlayState[] {
  const tuned = makeStrategy("tuned");
  const players = [tuned, tuned, tuned, tuned];
  const out: PlayState[] = [];
  for (let i = 0; out.length < count; i++) {
    const deal = dealCards(makeRng(i));
    const rng = makeRng(i);
    const opts = { deal, dealer: i % 4, players, scores: [0, 0] as [number, number], rules: DEFAULT_RULES, rng };
    const hands = deal.hands.map((h) => h.slice());
    const { auction, high } = runAuction(opts, hands);
    if (!high) continue;
    const contract = makeContract(high.bid, high.seat);
    const thirteen = [...hands[high.seat], ...deal.kitty];
    const discarded = tuned.discard({ seat: high.seat, dealer: i % 4, rules: DEFAULT_RULES, scores: [0, 0], hand: thirteen, auction, rng, contract, kitty: deal.kitty });
    hands[high.seat] = thirteen.filter((c) => !discarded.includes(c));
    if (contract.misere) hands[(high.seat + 2) % 4] = [];
    const s: PlayState = { contract, auction, dealer: i % 4, scores: [0, 0], rules: DEFAULT_RULES, hands, discarded, tricks: [], current: [], ledSuit: null, leader: high.seat, teamTricks: [0, 0] };
    // play with tuned until `left` tricks remain
    while (10 - s.tricks.length > left) {
      const seat = seatToPlay(s);
      const v = viewFor(s, seat, rng);
      applyPlay(s, tuned.play(v), v.ledSuit === null && v.contract.trump === null ? "S" : undefined);
    }
    out.push(s);
  }
  return out;
}

describe("endgame solver", () => {
  it("matches brute-force minimax with 3 tricks left", () => {
    for (const s of positions(150, 3)) expect(solveEndgame(cloneState(s))).toBe(brute(cloneState(s)));
  });

  it("fast solver matches brute force with 3 tricks left", () => {
    for (const s of positions(150, 3)) expect(solveEndgameFast(cloneState(s))).toBe(brute(cloneState(s)));
  });

  it("fast solver matches the basic solver with 4 and 5 tricks left", () => {
    for (const left of [4, 5]) for (const s of positions(120, left)) {
      expect(solveEndgameFast(cloneState(s))).toBe(solveEndgame(cloneState(s)));
    }
  });

  it("reports solve speed for 4-6 tricks left", () => {
    for (const left of [4, 5, 6]) {
      const ps = positions(100, left);
      for (const [name, f] of [["basic", solveEndgame], ["fast", solveEndgameFast]] as const) {
        const stats = { nodes: 0 };
        const t0 = Date.now();
        for (const s of ps) f(cloneState(s), stats);
        console.log(`${left} tricks left, ${name}: ${(stats.nodes / ps.length).toFixed(0)} nodes, ${((Date.now() - t0) / ps.length).toFixed(2)} ms per solve`);
      }
    }
  });
});
