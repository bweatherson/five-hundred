import { describe, expect, it } from "vitest";
import { misereExcess, misereGapDiscard, misereGapRisk } from "../src/strategies/heuristic.ts";

describe("gap misère model", () => {
  it("counts lower cards held by others minus lower cards we hold", () => {
    const e = misereExcess(["4H", "6H", "7S", "9S", "JK"]);
    expect(e.get("4H")).toBe(0); // lowest heart
    expect(e.get("6H")).toBe(0); // 5H out, but we hold 4H below it
    expect(e.get("7S")).toBe(2); // 5S, 6S out (no black 4s)
    expect(e.get("9S")).toBe(2); // 5S,6S,8S out, minus our 7S
    expect(e.get("JK")).toBe(Infinity);
  });
  it("credits voids", () => {
    const hand = ["4H", "5H", "6H", "4D", "5D", "6D", "5S", "6S", "7S", "AS"]; // void in clubs
    expect(misereGapRisk(hand, 0, 1)).toBe(0); // one danger (AS), one void
  });
  it("discards the Joker and the most exposed cards first", () => {
    const d = misereGapDiscard(["JK", "AS", "KS", "4H", "5H", "6H", "4D", "5D", "6D", "5S", "6S", "7S", "5C"]);
    expect(d.sort()).toEqual(["AS", "JK", "KS"]);
  });
});

import { evalDiscard, heuristicStrategy } from "../src/strategies/heuristic.ts";
import { DEFAULT_RULES, legalBids } from "../src/rules.ts";
import { makeRng } from "../src/rng.ts";

describe("kitty discard (eval mode)", () => {
  it("empties a short side suit to make a void, keeping trumps and aces", () => {
    // Hearts trumps; a short club suit K-7 and a single 8D; spades A-Q-9-6.
    const hand = ["JK", "JH", "JD", "AH", "KH", "9H", "5H", "AS", "QS", "9S", "6S", "KC", "7C"];
    const d = evalDiscard(hand, "H", true);
    expect(d.sort()).toEqual(["6S", "7C", "KC"].sort());
  });
});

describe("signal bids", () => {
  const view = (hand: string[]) => ({
    seat: 1, dealer: 0, rules: DEFAULT_RULES, scores: [0, 0] as [number, number], hand, auction: [],
    rng: makeRng(1), legal: legalBids([], DEFAULT_RULES),
  });
  const modest = ["JD", "JH", "AD", "7D", "8S", "6S", "5S", "9C", "7C", "6C"];
  it("bids 6 in a modest suit only when signalling is on", () => {
    expect(heuristicStrategy({ aggression: -3 }).bid(view(modest))).toBeNull();
    expect(heuristicStrategy({ aggression: -3, signalBid: 2.5, signalStrains: "all" }).bid(view(modest)))
      .toEqual({ kind: "suit", tricks: 6, strain: "D" });
  });
  it("black-only signals ignore red suits", () => {
    expect(heuristicStrategy({ aggression: -3, signalBid: 2.5, signalStrains: "SC" }).bid(view(modest))).toBeNull();
  });
});
