import { describe, expect, it } from "vitest";
import { Card } from "../src/cards.ts";
import { PlayView } from "../src/player.ts";
import { makeStrategy } from "../src/registry.ts";
import { DEFAULT_RULES, isTrump, legalPlays, makeContract } from "../src/rules.ts";
import { makeRng } from "../src/rng.ts";

// Hearts are trumps; seat 0 bid and won the first trick, and leads again.
function view(hand: Card[], trick1: Card[]): PlayView {
  return {
    seat: 0, dealer: 3, rules: DEFAULT_RULES, scores: [0, 0], hand, auction: [], rng: makeRng(1),
    contract: makeContract({ kind: "suit", tricks: 7, strain: "H" }, 0), activeSeats: [0, 1, 2, 3],
    tricks: [{ leader: 0, ledSuit: "H", winner: 0, plays: trick1.map((card, seat) => ({ seat, card })) }],
    current: [], ledSuit: null, legal: legalPlays(hand, null, "H"), exposed: null, discarded: ["4D", "5D", "6D"],
  };
}

const hand: Card[] = ["JD", "AH", "KH", "AS", "KS", "AC", "KC", "QC", "7D"];

describe("drawing trumps", () => {
  it("stops once both opponents have shown out (partner may still hold trumps)", () => {
    const v = view(hand, ["JH", "4S", "JK", "6S"]);
    expect(isTrump(makeStrategy("tuned12").play(v), "H")).toBe(true);
    expect(isTrump(makeStrategy("tuned13").play(v), "H")).toBe(false);
  });

  it("treats a high trump dropped under a winner as the opponent's last", () => {
    // West drops the queen under the Joker; only the bidder's own trumps outrank it.
    const v = view(["JH", "JD", "AH", "KH", "AS", "KS", "AC", "KC", "7D"], ["JK", "QH", "5H", "6S"]);
    expect(isTrump(makeStrategy("tuned12").play(v), "H")).toBe(true);
    expect(isTrump(makeStrategy("tuned13").play(v), "H")).toBe(false);
  });

  it("keeps drawing when an opponent's low trump could be from a longer holding", () => {
    const v = view(["JH", "JD", "AH", "KH", "AS", "KS", "AC", "KC", "7D"], ["JK", "5H", "6H", "6S"]);
    expect(isTrump(makeStrategy("tuned13").play(v), "H")).toBe(true);
  });
});
