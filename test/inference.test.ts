import { describe, expect, it } from "vitest";
import { dealCards, playHand } from "../src/game.ts";
import { DEFAULT_RULES, isTrump } from "../src/rules.ts";
import { PlayView, Strategy } from "../src/player.ts";
import { makeRng } from "../src/rng.ts";
import { makeStrategy } from "../src/registry.ts";
import { DEFAULT_INFERENCE, auctionConstraints, violation } from "../src/strategies/inference.ts";
import { SimParams, sampleConsistentWorld } from "../src/strategies/simulation.ts";

describe("auction inference", () => {
  it("samples deals closer to the bidder's real trump holding, as a defender", () => {
    const tuned = makeStrategy("tuned");
    const params = (infer: boolean): SimParams => ({
      worlds: 1, rollout: tuned, base: tuned, respectVoids: true, infer, tries: 20, inference: DEFAULT_INFERENCE, endgame: 0,
    });
    const err = { plain: 0, infer: 0, n: 0 };
    const viol = { plain: 0, infer: 0 };
    let realHands: string[][] = [];
    const spy: Strategy = {
      ...tuned,
      play(v: PlayView) {
        const b = v.contract.bidder;
        if (v.contract.trump && v.seat % 2 !== b % 2 && v.tricks.length === 0) {
          const real = realHands[b].filter((c) => isTrump(c, v.contract.trump)).length;
          const cons = auctionConstraints(v);
          for (const infer of [false, true]) {
            const w = sampleConsistentWorld(v, params(infer), cons);
            const got = w.hands[b].filter((c) => isTrump(c, v.contract.trump)).length
              + v.current.filter((p) => p.seat === b && isTrump(p.card, v.contract.trump)).length;
            err[infer ? "infer" : "plain"] += Math.abs(got - real);
            viol[infer ? "infer" : "plain"] += violation(v, w.hands, cons);
          }
          err.n++;
        }
        return tuned.play(v);
      },
    };
    for (let i = 0; i < 400; i++) {
      const deal = dealCards(makeRng(i));
      // Capture the bidder's post-kitty hand by wrapping discard.
      realHands = deal.hands.map((h) => h.slice());
      const wrap: Strategy = { ...spy, discard: (v) => { const d = tuned.discard(v); realHands[v.seat] = v.hand.filter((c) => !d.includes(c)); return d; } };
      playHand({ deal, dealer: i % 4, players: [wrap, wrap, wrap, wrap], scores: [0, 0], rules: DEFAULT_RULES, rng: makeRng(i) });
    }
    expect(err.n).toBeGreaterThan(100);
    expect(viol.infer).toBeLessThan(viol.plain * 0.5);
    expect(err.infer / err.n).toBeLessThan(err.plain / err.n);
    console.log(`bidder trump-count error per sample: plain ${(err.plain / err.n).toFixed(2)}, inferred ${(err.infer / err.n).toFixed(2)}`);
  });
});
