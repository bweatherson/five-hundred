// Baseline: plays any legal card at random and bids timidly at random.
// Anything sensible should beat this comfortably.
import { Strategy } from "../player.ts";
import { pick, shuffle } from "../rng.ts";

export function randomStrategy(passRate = 0.75): Strategy {
  return {
    name: "random",
    bid(v) {
      if (v.legal.length === 0 || v.rng() < passRate) return null;
      return pick(v.legal.slice(0, 3), v.rng);
    },
    discard(v) {
      return shuffle(v.hand, v.rng).slice(0, 3);
    },
    play(v) {
      return pick(v.legal, v.rng);
    },
  };
}
