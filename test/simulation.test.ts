import { describe, expect, it } from "vitest";
import { dealCards, playHand } from "../src/game.ts";
import { DEFAULT_RULES, effectiveSuit } from "../src/rules.ts";
import { PlayView, Strategy } from "../src/player.ts";
import { makeRng } from "../src/rng.ts";
import { makeStrategy } from "../src/registry.ts";
import { handSizes, knownVoids, sampleWorld } from "../src/strategies/sampling.ts";

describe("world sampling", () => {
  it("gives every hidden hand the right size, no duplicates, and respects shown voids", () => {
    const tuned = makeStrategy("tuned");
    let checked = 0;
    // Spy on views partway through real hands.
    const spy: Strategy = {
      ...tuned,
      name: "spy",
      play(v: PlayView) {
        if (v.tricks.length >= 3) {
          const w = sampleWorld(v, makeRng(checked), true);
          const sizes = handSizes(v);
          const voids = knownVoids(v);
          const all = w.hands.flat().concat(w.discarded ?? []);
          expect(new Set(all).size).toBe(all.length);
          for (let s = 0; s < 4; s++) {
            if (s === v.seat) continue;
            expect(w.hands[s].length).toBe(sizes[s]);
            for (const c of w.hands[s]) expect(voids[s].has(effectiveSuit(c, v.contract.trump) as never)).toBe(false);
          }
          checked++;
        }
        return tuned.play(v);
      },
    };
    for (let i = 0; i < 200; i++) {
      playHand({ deal: dealCards(makeRng(i)), dealer: i % 4, players: [spy, tuned, spy, tuned], scores: [0, 0], rules: DEFAULT_RULES, rng: makeRng(i) });
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe("simulation player", () => {
  it("plays only legal cards (including misère and no-trump hands)", () => {
    const sim = makeStrategy("sim:worlds=3");
    const tuned = makeStrategy("tuned");
    for (let i = 0; i < 150; i++) {
      const players = i % 2 ? [sim, tuned, sim, tuned] : [tuned, sim, tuned, sim];
      const r = playHand({ deal: dealCards(makeRng(i)), dealer: i % 4, players, scores: [0, 0], rules: DEFAULT_RULES, rng: makeRng(i) });
      if (r.contract) expect(r.teamTricks[0] + r.teamTricks[1]).toBe(10);
    }
  });
});
