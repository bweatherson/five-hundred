import { describe, expect, it } from "vitest";
import { makeDeck } from "../src/cards.ts";
import {
  Bid, DEFAULT_RULES, ALL_BIDS, bidRank, bidValue, effectiveSuit, gameWinner, legalBids, legalPlays,
  makeContract, scoreHand, trickWinnerIndex,
} from "../src/rules.ts";

const suit = (tricks: number, strain: "S" | "C" | "D" | "H" | "NT"): Bid => ({ kind: "suit", tricks, strain });
const MIS: Bid = { kind: "misere" };
const OPEN: Bid = { kind: "openMisere" };

describe("deck", () => {
  it("has 43 cards: no black 4s, red 4s present, one Joker", () => {
    const d = makeDeck();
    expect(d.length).toBe(43);
    expect(new Set(d).size).toBe(43);
    expect(d).not.toContain("4S");
    expect(d).not.toContain("4C");
    expect(d).toContain("4H");
    expect(d).toContain("4D");
    expect(d).toContain("JK");
  });
});

describe("bids", () => {
  it("uses the Avondale values", () => {
    expect(bidValue(suit(6, "S"))).toBe(40);
    expect(bidValue(suit(6, "NT"))).toBe(120);
    expect(bidValue(suit(7, "S"))).toBe(140);
    expect(bidValue(suit(8, "H"))).toBe(300);
    expect(bidValue(suit(10, "NT"))).toBe(520);
    expect(bidValue(MIS)).toBe(250);
    expect(bidValue(OPEN)).toBe(500);
  });
  it("ranks misère between 8♠ and 8♣, open misère between 10♦ and 10♥", () => {
    expect(bidRank(MIS)).toBeGreaterThan(bidRank(suit(8, "S")));
    expect(bidRank(MIS)).toBeLessThan(bidRank(suit(8, "C")));
    expect(bidRank(OPEN)).toBeGreaterThan(bidRank(suit(10, "D")));
    expect(bidRank(OPEN)).toBeLessThan(bidRank(suit(10, "H")));
    expect(ALL_BIDS.length).toBe(27);
  });
  it("only allows misère after someone has bid 7", () => {
    const has = (bids: Bid[], k: string) => bids.some((b) => b.kind === k);
    expect(has(legalBids([], DEFAULT_RULES), "misere")).toBe(false);
    expect(has(legalBids([{ seat: 1, bid: suit(6, "H") }], DEFAULT_RULES), "misere")).toBe(false);
    expect(has(legalBids([{ seat: 1, bid: suit(7, "S") }], DEFAULT_RULES), "misere")).toBe(true);
    expect(has(legalBids([{ seat: 1, bid: suit(7, "S") }, { seat: 2, bid: suit(8, "C") }], DEFAULT_RULES), "misere")).toBe(false);
    expect(has(legalBids([], DEFAULT_RULES), "openMisere")).toBe(true);
  });
  it("follows the misère house rules", () => {
    const has = (bids: Bid[], k: string) => bids.some((b) => b.kind === k);
    const eight = { ...DEFAULT_RULES, openMisere: "afterEight" as const };
    expect(has(legalBids([], eight), "openMisere")).toBe(false);
    expect(has(legalBids([{ seat: 1, bid: suit(7, "NT") }], eight), "openMisere")).toBe(false);
    expect(has(legalBids([{ seat: 1, bid: suit(8, "S") }], eight), "openMisere")).toBe(true);
    const noOpen = { ...DEFAULT_RULES, openMisere: "off" as const };
    expect(has(legalBids([{ seat: 1, bid: suit(9, "S") }], noOpen), "openMisere")).toBe(false);
    const anyMis = { ...DEFAULT_RULES, misereNeedsSeven: false };
    expect(has(legalBids([], anyMis), "misere")).toBe(true);
    const noMis = { ...DEFAULT_RULES, allowMisere: false };
    expect(has(legalBids([{ seat: 1, bid: suit(7, "S") }], noMis), "misere")).toBe(false);
  });
  it("only allows bids above the current high bid", () => {
    const legal = legalBids([{ seat: 1, bid: suit(7, "D") }, { seat: 2, bid: null }], DEFAULT_RULES);
    expect(legal.every((b) => bidRank(b) > bidRank(suit(7, "D")))).toBe(true);
    expect(legal[0]).toEqual(suit(7, "H"));
  });
});

describe("trumps and following", () => {
  it("treats the Left Bower and Joker as trumps", () => {
    expect(effectiveSuit("JC", "S")).toBe("S");
    expect(effectiveSuit("JS", "S")).toBe("S");
    expect(effectiveSuit("JD", "S")).toBe("D");
    expect(effectiveSuit("JK", "H")).toBe("H");
    expect(effectiveSuit("JK", null)).toBe(null);
  });
  it("forces the Left Bower when trumps are led, but not on its printed suit", () => {
    const hand = ["JC", "AC", "5H"];
    expect(legalPlays(hand, "S", "S")).toEqual(["JC"]);
    expect(legalPlays(hand, "C", "S")).toEqual(["AC"]);
  });
  it("in no-trumps, the Joker can only be played when void in the led suit", () => {
    expect(legalPlays(["JK", "5H", "AS"], "H", null)).toEqual(["5H"]);
    expect(legalPlays(["JK", "AS"], "H", null).sort()).toEqual(["AS", "JK"]);
  });
  it("ranks Joker > right bower > left bower > ace of trumps", () => {
    const plays = (cards: string[]) => cards.map((card, seat) => ({ seat, card }));
    expect(trickWinnerIndex(plays(["AH", "JD", "JH", "JK"]), "H", "H")).toBe(3);
    expect(trickWinnerIndex(plays(["AH", "JD", "JH", "KH"]), "H", "H")).toBe(2);
    expect(trickWinnerIndex(plays(["AH", "JD", "QH", "KH"]), "H", "H")).toBe(1);
    expect(trickWinnerIndex(plays(["9S", "AC", "4H", "TS"]), "S", "H")).toBe(2);
    expect(trickWinnerIndex(plays(["9S", "AC", "AD", "TS"]), "S", "H")).toBe(3);
    expect(trickWinnerIndex(plays(["9S", "JK", "AS"]), "S", null)).toBe(1);
  });
});

describe("scoring", () => {
  const R = DEFAULT_RULES;
  it("scores a made contract and defenders' tricks", () => {
    const s = scoreHand(makeContract(suit(7, "S"), 0), [8, 2], R);
    expect(s).toEqual({ points: [140, 20], made: true });
  });
  it("scores a failed contract", () => {
    const s = scoreHand(makeContract(suit(8, "NT"), 1), [4, 6], R);
    expect(s).toEqual({ points: [40, -320], made: false });
  });
  it("gives 250 for all ten tricks when the bid is worth less", () => {
    expect(scoreHand(makeContract(suit(6, "S"), 0), [10, 0], R).points).toEqual([250, 0]);
    expect(scoreHand(makeContract(suit(8, "H"), 0), [10, 0], R).points).toEqual([300, 0]);
  });
  it("scores misère, with defenders still scoring their tricks", () => {
    expect(scoreHand(makeContract(MIS, 2), [0, 10], R)).toEqual({ points: [250, 100], made: true });
    expect(scoreHand(makeContract(MIS, 2), [2, 8], R)).toEqual({ points: [-250, 80], made: false });
    expect(scoreHand(makeContract(OPEN, 3), [10, 0], R)).toEqual({ points: [100, 500], made: true });
  });
  it("supports the optional rule where bidders also score tricks", () => {
    const rules = { ...R, bidderScoresTricks: true };
    expect(scoreHand(makeContract(suit(6, "S"), 0), [10, 0], rules).points).toEqual([350, 0]);
  });
  it("ends the game at 500 however it is reached", () => {
    expect(gameWinner([500, 100], 1, R)).toBe(0); // defenders reached 500 on tricks
    expect(gameWinner([510, 520], 1, R)).toBe(1); // both: bidders win
    expect(gameWinner([-500, 100], 0, R)).toBe(1);
    expect(gameWinner([490, 100], 0, R)).toBe(null);
  });
});
