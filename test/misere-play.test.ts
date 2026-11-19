import { describe, expect, it } from "vitest";
import { Card } from "../src/cards.ts";
import { PlayView } from "../src/player.ts";
import { makeStrategy } from "../src/registry.ts";
import { DEFAULT_RULES, legalPlays, makeContract } from "../src/rules.ts";
import { makeRng } from "../src/rng.ts";

describe("misère bidder discards", () => {
  it("throws an ace rather than a singleton 4 that can never win", () => {
    // Seat 0 bid misère; seat 3 won trick 1 and leads a club, which seat 0 is out of.
    const hand: Card[] = ["4D", "AH", "6H", "5H", "AS", "8S", "7S", "6S", "5S"];
    const v: PlayView = {
      seat: 0, dealer: 3, rules: DEFAULT_RULES, scores: [0, 0], hand, auction: [], rng: makeRng(1),
      contract: makeContract({ kind: "misere" }, 0), activeSeats: [0, 1, 3],
      tricks: [{ leader: 0, ledSuit: "S", winner: 3, plays: [{ seat: 0, card: "9S" }, { seat: 1, card: "TS" }, { seat: 3, card: "QS" }] }],
      current: [{ seat: 3, card: "KC" }], ledSuit: "C", legal: legalPlays(hand, "C", null), exposed: null,
      discarded: ["JK", "KH", "QD"],
    };
    expect(makeStrategy("tuned14").play(v)).toBe("4D"); // the old rule: top card of the shortest suit
    expect(makeStrategy("tuned15").play(v)).toBe("AH");
  });

  it("can lead from a safe suit rather than the 7 of a J-7", () => {
    const hand: Card[] = ["5S", "6S", "7S", "8S", "5C", "6C", "7C", "8C", "JH", "7H"];
    const v: PlayView = {
      seat: 0, dealer: 3, rules: DEFAULT_RULES, scores: [0, 0], hand, auction: [], rng: makeRng(1),
      contract: makeContract({ kind: "misere" }, 0), activeSeats: [0, 1, 3],
      tricks: [], current: [], ledSuit: null, legal: legalPlays(hand, null, null), exposed: null,
      discarded: ["JK", "AD", "KD"],
    };
    expect(makeStrategy("tuned14").play(v)).toBe("7H");
    expect(["5S", "5C"]).toContain(makeStrategy("tuned14:misereLeadBelow=0").play(v));
  });
});

describe("open misère defence", () => {
  it("doesn't lead a suit the exposed bidder is out of", () => {
    // Seat 0 bid open misère and shows 7♠ K♥ 10♥ 7♥ 6♥ 4♥ 5♣: no diamonds. West is on lead.
    const exposed: Card[] = ["7S", "KH", "TH", "7H", "6H", "4H", "5C"];
    const hand: Card[] = ["8D", "TD", "QS", "AS", "9H", "9C", "JC"];
    const v: PlayView = {
      seat: 1, dealer: 1, rules: DEFAULT_RULES, scores: [0, 0], hand, auction: [], rng: makeRng(1),
      contract: makeContract({ kind: "openMisere" }, 0), activeSeats: [0, 1, 3],
      tricks: [], current: [], ledSuit: null, legal: legalPlays(hand, null, null), exposed, discarded: null,
    };
    expect(makeStrategy("tuned14").play(v)).toBe("8D");
    expect(makeStrategy("tuned15").play(v)).not.toMatch(/D$/);
  });
});
