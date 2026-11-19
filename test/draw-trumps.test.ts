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

describe("partner's trump support", () => {
  it("stops drawing when the last trump out is probably partner's", () => {
    // Seat 0 bid 6♦, partner raised to 7♦, seat 0 won at 8♦. Two rounds of trumps: everyone followed; only the A♦ is out.
    const hand: Card[] = ["JK", "9D", "7D", "6D", "AS", "AC", "AH", "KS"];
    const d = (tricks: number, strain: "D") => ({ kind: "suit" as const, tricks, strain });
    const v: PlayView = {
      seat: 0, dealer: 3, rules: DEFAULT_RULES, scores: [0, 0], hand, rng: makeRng(1),
      auction: [{ seat: 0, bid: d(6, "D") }, { seat: 1, bid: null }, { seat: 2, bid: d(7, "D") }, { seat: 3, bid: null }, { seat: 0, bid: d(8, "D") }],
      contract: makeContract(d(8, "D"), 0), activeSeats: [0, 1, 2, 3],
      tricks: [
        { leader: 0, ledSuit: "D", winner: 0, plays: ["JD", "TD", "8D", "5D"].map((card, seat) => ({ seat, card })) },
        { leader: 0, ledSuit: "D", winner: 0, plays: ["JH", "QD", "KD", "4D"].map((card, seat) => ({ seat, card })) },
      ],
      current: [], ledSuit: null, legal: legalPlays(hand, null, "D"), exposed: null, discarded: ["QC", "JC", "TC"],
    };
    expect(isTrump(makeStrategy("tuned16").play(v), "D")).toBe(true);
    expect(isTrump(makeStrategy("tuned17").play(v), "D")).toBe(false);
  });
});

describe("defender in control of trumps", () => {
  // East (seat 3) won the bid at 6♥ and leads the right bower. We hold the Joker, left bower, A♥ and two low hearts.
  const hand: Card[] = ["JK", "JD", "AH", "7H", "5H", "AS", "KS", "QC", "9C", "8D"];
  const h6 = { kind: "suit" as const, tricks: 6, strain: "H" as const };
  const base = {
    seat: 0, dealer: 2, rules: DEFAULT_RULES, scores: [0, 0] as [number, number], rng: makeRng(1),
    auction: [{ seat: 3, bid: h6 }, { seat: 0, bid: null }, { seat: 1, bid: null }, { seat: 2, bid: null }],
    contract: makeContract(h6, 3), activeSeats: [0, 1, 2, 3], exposed: null, discarded: null,
  };
  it("wins the right bower with the Joker", () => {
    const v: PlayView = { ...base, hand, tricks: [], current: [{ seat: 3, card: "JH" }], ledSuit: "H", legal: legalPlays(hand, "H", "H") };
    expect(makeStrategy("tuned17").play(v)).toBe("5H");
    expect(makeStrategy("tuned18").play(v)).toBe("JK");
  });
  it("can then draw trumps with the left bower (defControl, tested but not adopted)", () => {
    const rest = hand.filter((c) => c !== "JK");
    const v: PlayView = {
      ...base, hand: rest, current: [], ledSuit: null, legal: legalPlays(rest, null, "H"),
      tricks: [{ leader: 3, ledSuit: "H", winner: 0, plays: [{ seat: 3, card: "JH" }, { seat: 0, card: "JK" }, { seat: 1, card: "6H" }, { seat: 2, card: "8H" }] }],
    };
    expect(isTrump(makeStrategy("tuned17").play(v), "H")).toBe(false);
    expect(makeStrategy("tuned17:defControl=5").play(v)).toBe("JD");
  });
});

describe("no-trump bids", () => {
  it("tuned14 won't bid no-trumps without an ace", () => {
    const hand: Card[] = ["JK", "KS", "QS", "9S", "KH", "QH", "8H", "KC", "QC", "KD"];
    const v = { seat: 1, dealer: 0, rules: DEFAULT_RULES, scores: [0, 0] as [number, number], hand, auction: [], rng: makeRng(1),
      legal: (["S", "C", "D", "H", "NT"] as const).map((strain) => ({ kind: "suit" as const, tricks: 6, strain })) };
    const b13 = makeStrategy("tuned13").bid(v);
    const b14 = makeStrategy("tuned14").bid(v);
    expect(b13 && b13.kind === "suit" ? b13.strain : null).toBe("NT");
    expect(b14 && b14.kind === "suit" ? b14.strain : null).not.toBe("NT");
  });
});
