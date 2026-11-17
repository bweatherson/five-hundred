import { describe, expect, it } from "vitest";
import { Card, makeDeck } from "../src/cards.ts";
import { Deal, dealCards, playGame, playHand } from "../src/game.ts";
import { BidAction, DEFAULT_RULES } from "../src/rules.ts";
import { Strategy } from "../src/player.ts";
import { makeRng } from "../src/rng.ts";
import { randomStrategy } from "../src/strategies/random.ts";
import { heuristicStrategy } from "../src/strategies/heuristic.ts";
import { duplicateHands } from "../src/tournament.ts";

/** A strategy that bids from a script and otherwise plays the first legal card. */
function scripted(bids: BidAction[]): Strategy & { seen: number } {
  let i = 0;
  const s = {
    name: "scripted",
    seen: 0,
    bid: () => { s.seen++; return bids[i++] ?? null; },
    discard: (v: { hand: Card[] }) => v.hand.slice(0, 3),
    play: (v: { legal: Card[] }) => v.legal[0],
  };
  return s;
}

const deal = (): Deal => dealCards(makeRng(42));
const opts = (players: Strategy[]) => ({ deal: deal(), dealer: 3, players, scores: [0, 0] as [number, number], rules: DEFAULT_RULES, rng: makeRng(1) });

describe("auction", () => {
  it("redeals when all four pass", () => {
    const r = playHand(opts([0, 1, 2, 3].map(() => scripted([]))));
    expect(r.contract).toBeNull();
    expect(r.auction.length).toBe(4);
  });

  it("gives no re-entry after passing and ends when three have passed", () => {
    const p = [
      scripted([{ kind: "suit", tricks: 6, strain: "S" }, { kind: "suit", tricks: 7, strain: "S" }]), // seat 0 leads off
      scripted([null]),
      scripted([{ kind: "suit", tricks: 6, strain: "H" }, null]),
      scripted([null]),
    ];
    const r = playHand(opts(p));
    expect(r.contract?.bidder).toBe(0);
    expect(r.contract?.bid).toEqual({ kind: "suit", tricks: 7, strain: "S" });
    expect(p[1].seen).toBe(1);
    expect(p[3].seen).toBe(1);
    expect(r.auction.map((e) => e.seat)).toEqual([0, 1, 2, 3, 0, 2]);
  });
});

describe("misère", () => {
  it("the bidder's partner sits out and tricks have three cards", () => {
    const p = [
      scripted([{ kind: "suit", tricks: 7, strain: "S" }]),
      scripted([{ kind: "misere" }]),
      scripted([null]),
      scripted([null]),
    ];
    // seat 0 bids 7♠, seat 1 misère, seat 2 pass, seat 3 pass, seat 0 (scripted: no more bids) passes
    const r = playHand(opts(p));
    expect(r.contract?.misere).toBe(true);
    expect(r.contract?.bidder).toBe(1);
    expect(r.tricks.length).toBe(10);
    for (const t of r.tricks) {
      expect(t.plays.length).toBe(3);
      expect(t.plays.some((pl) => pl.seat === 3)).toBe(false);
    }
  });

  it("shows the open misère bidder's hand to the others", () => {
    let sawExposed = false;
    const watcher: Strategy = {
      name: "watcher",
      bid: () => null,
      discard: (v) => v.hand.slice(0, 3),
      play: (v) => { if (v.exposed && v.exposed.length > 0) sawExposed = true; return v.legal[0]; },
    };
    const p = [scripted([{ kind: "openMisere" }]), watcher, watcher, watcher];
    const r = playHand(opts(p));
    expect(r.contract?.open).toBe(true);
    expect(sawExposed).toBe(true);
  });
});

describe("engine soak test", () => {
  it("plays thousands of hands with random and heuristic players without illegal moves", () => {
    const deck = new Set(makeDeck());
    const kinds = [randomStrategy(0.5), heuristicStrategy()];
    let contracts = 0;
    for (let i = 0; i < 3000; i++) {
      const players = [0, 1, 2, 3].map((s) => kinds[(i + s) % 2]);
      const d = dealCards(makeRng(i));
      const r = playHand({ deal: d, dealer: i % 4, players, scores: [0, 0], rules: DEFAULT_RULES, rng: makeRng(i + 1e6) });
      if (!r.contract) continue;
      contracts++;
      const played = r.tricks.flatMap((t) => t.plays.map((p) => p.card));
      const all = [...played, ...r.discarded!];
      expect(new Set(all).size).toBe(all.length); // no card played twice
      all.forEach((c) => expect(deck.has(c)).toBe(true));
      expect(r.teamTricks[0] + r.teamTricks[1]).toBe(10);
    }
    expect(contracts).toBeGreaterThan(1000);
  });

  it("finishes full games", () => {
    const h = heuristicStrategy();
    for (let i = 0; i < 50; i++) {
      const g = playGame({ players: [h, h, h, h], rules: DEFAULT_RULES, dealSeed: i, playerSeed: i });
      expect(g.winner).not.toBeNull();
    }
  });
});

describe("duplicate", () => {
  it("is reproducible and gives zero difference for identical strategies", () => {
    const h = heuristicStrategy();
    const r1 = duplicateHands(h, h, 200, 5);
    const r2 = duplicateHands(h, h, 200, 5);
    expect(r1.diff.mean).toBe(r2.diff.mean);
    expect(r1.diff.mean).toBe(0); // deterministic strategy vs itself, same cards both ways
  });
});
