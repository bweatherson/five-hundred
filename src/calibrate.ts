// Collect data for calibrating the trick estimate: on random deals, make each
// seat declare each strain at the 7 level (everyone else passes), play it out,
// and record the hand's features and the tricks the declaring side took.
// Usage: npx tsx src/calibrate.ts <strategy> <deals> <seed> > out.jsonl
import { makeStrategy } from "./registry.ts";
import { Strategy } from "./player.ts";
import { STRAINS, Strain } from "./rules.ts";
import { dealCards, playHand } from "./game.ts";
import { DEFAULT_RULES } from "./rules.ts";
import { deriveSeed, makeRng } from "./rng.ts";
import { strainFeatures } from "./strategies/features.ts";
import { estimateTricks } from "./strategies/heuristic.ts";

const [spec = "tuned3", dealsArg = "1000", seedArg = "1"] = process.argv.slice(2);
const base = makeStrategy(spec);
const deals = Number(dealsArg), seed = Number(seedArg);

function forcing(seat: number, strain: Strain): Strategy {
  return {
    ...base,
    bid(v) {
      if (v.seat !== seat) return null;
      return v.legal.find((b) => b.kind === "suit" && b.tricks === 7 && b.strain === strain) ?? null;
    },
  };
}

const out: string[] = [];
for (let i = 0; i < deals; i++) {
  const deal = dealCards(makeRng(deriveSeed(seed, i)));
  const seat = i % 4;
  for (const strain of STRAINS) {
    const p = forcing(seat, strain);
    const r = playHand({
      deal, dealer: (seat + 3) % 4, players: [p, p, p, p], scores: [0, 0], rules: DEFAULT_RULES,
      rng: makeRng(deriveSeed(seed, i, 7)),
    });
    const hand = deal.hands[seat];
    out.push(JSON.stringify({
      s: strain, f: strainFeatures(hand, strain), old: estimateTricks(hand, strain), t: r.teamTricks[seat % 2],
    }));
  }
  if (out.length >= 2000) { process.stdout.write(out.join("\n") + "\n"); out.length = 0; }
}
if (out.length) process.stdout.write(out.join("\n") + "\n");
