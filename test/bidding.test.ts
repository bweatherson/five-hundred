import { describe, expect, it } from "vitest";
import { Card } from "../src/cards.ts";
import { makeStrategy } from "../src/registry.ts";
import { DEFAULT_RULES, legalBids } from "../src/rules.ts";
import { makeRng } from "../src/rng.ts";

const hand: Card[] = ["JK", "JH", "JD", "AH", "KH", "QH", "AS", "KS", "AC", "9C"];
const view = (scores: [number, number]) => ({
  seat: 1, dealer: 0, rules: DEFAULT_RULES, scores, hand, auction: [], rng: makeRng(1), legal: legalBids([], DEFAULT_RULES),
});
const level = (b: ReturnType<ReturnType<typeof makeStrategy>["bid"]>) => (b && b.kind === "suit" ? b.tricks : 0);

describe("jump bids", () => {
  it("tuned16 opens a big hand at its full value, where tuned15 opens at 6", () => {
    expect(level(makeStrategy("tuned15").bid(view([0, 0])))).toBe(6);
    expect(level(makeStrategy("tuned16").bid(view([0, 0])))).toBeGreaterThanOrEqual(8);
  });
  it("doesn't jump past the cheapest bid that wins the game", () => {
    // Seat 1's side has 440: 6♥ (100) is enough.
    const b = makeStrategy("tuned16").bid(view([0, 440]));
    expect(b).toEqual({ kind: "suit", tricks: 6, strain: "H" });
  });
});
