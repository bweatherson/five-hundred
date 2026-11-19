// Misère play probe. Deals hands until one seat holds a hand the computer would
// bid misère (or open misère) on, gives that seat the contract and the kitty,
// and plays the hand out once per pairing of bidder and defender strategies
// (same cards, same seed). Prints how often each pairing makes the contract.
//
//   npx tsx src/probe-misere.ts <hands> <seed> <open|closed> "bidderSpec/defenderSpec" ...
import { dealCards, PlayState, continuePlay } from "./game.ts";
import { makeRng, deriveSeed } from "./rng.ts";
import { makeContract, teamOf, DEFAULT_RULES } from "./rules.ts";
import { makeStrategy } from "./registry.ts";
import { meanCI } from "./tournament.ts";
import { misereGapDiscard, misereGapRisk } from "./strategies/heuristic.ts";

const [handsArg, seedArg, kind, ...pairs] = process.argv.slice(2);
const want = Number(handsArg);
const seed = Number(seedArg);
const open = kind === "open";
const specs = pairs.map((p) => p.split("/").map((s) => makeStrategy(s)));
const made: number[][] = pairs.map(() => []);

let found = 0;
for (let i = 0; found < want; i++) {
  const deal = dealCards(makeRng(deriveSeed(seed, i)));
  // The seat whose 13 cards (with the kitty) look safest, if the computer would bid on its 10.
  const risk = (h: string[]) => (open ? misereGapRisk(h, 0, 0.5) : misereGapRisk(h, 1, 1));
  const seat = [0, 1, 2, 3].reduce((a, b) => (risk(deal.hands[b]) < risk(deal.hands[a]) ? b : a));
  if (risk(deal.hands[seat]) > (open ? 0 : 1)) continue;
  found++;
  const thirteen = [...deal.hands[seat], ...deal.kitty];
  const discarded = misereGapDiscard(thirteen);
  const contract = makeContract({ kind: open ? "openMisere" : "misere" }, seat);
  specs.forEach(([bidderS, defS], k) => {
    const hands = deal.hands.map((h) => h.slice());
    hands[seat] = thirteen.filter((c) => !discarded.includes(c));
    const players = [0, 1, 2, 3].map((s) => (teamOf(s) === teamOf(seat) ? bidderS : defS));
    const state: PlayState = {
      contract, auction: [], dealer: (seat + 3) % 4, scores: [0, 0], rules: DEFAULT_RULES, hands, discarded,
      tricks: [], current: [], ledSuit: null, leader: seat, teamTricks: [0, 0],
    };
    continuePlay(state, players, makeRng(deriveSeed(seed, i, 1000)));
    made[k].push(state.teamTricks[teamOf(seat)] === 0 ? 1 : 0);
  });
}

console.log(`${open ? "Open misère" : "Misère"}: ${want} hands, seed ${seed}. Made %, and the difference from the first pairing.`);
pairs.forEach((p, k) => {
  const m = meanCI(made[k]);
  const d = meanCI(made[k].map((x, j) => x - made[0][j]));
  console.log(`${p.padEnd(70)} ${(100 * m.mean).toFixed(1).padStart(5)}%   ${k ? `${d.mean >= 0 ? "+" : ""}${(100 * d.mean).toFixed(1)} ± ${(100 * d.ci95).toFixed(1)}` : ""}`);
});
