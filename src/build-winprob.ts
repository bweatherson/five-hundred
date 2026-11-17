// Build data/winprob.json from self-play of a reference strategy.
//   npm run build-winprob -- [strategy] [hands]
import { makeStrategy } from "./registry.ts";
import { collectOutcomes, saveScoreStates, saveWinTable, solveWinTable } from "./winprob.ts";
import { playGame } from "./game.ts";
import { DEFAULT_RULES } from "./rules.ts";
import { shuffle, makeRng } from "./rng.ts";

const spec = process.argv[2] ?? "tuned2";
const hands = Number(process.argv[3] ?? 200000);
const t0 = Date.now();
const o = collectOutcomes(makeStrategy(spec), hands, 12345);
{
  let dealerPts = 0, otherPts = 0, dealerBids = 0, played = 0;
  for (const [k, n] of Object.entries(o.counts)) {
    const [a, b, d] = k.split(",").map(Number);
    dealerPts += a * n; otherPts += b * n; dealerBids += d * n; played += n;
  }
  console.log(`dealing team: ${(dealerPts / o.hands).toFixed(1)} pts/hand, other team ${(otherPts / o.hands).toFixed(1)}; dealing team wins the bid ${(100 * dealerBids / played).toFixed(1)}%`);
}
const t1 = Date.now();
const table = solveWinTable(o);
console.log(`${hands} hands of ${spec} (${t1 - t0} ms, ${o.passes} redeals, ${Object.keys(o.counts).length} distinct results); solved in ${Date.now() - t1} ms`);
for (const [a, b] of [[0, 0], [300, 0], [0, 300], [400, 400], [450, 0], [0, 450], [-300, 0], [470, 470]]) {
  console.log(`  W(${a}, ${b}) = ${table.team0(a, b).toFixed(3)}   team 0 deals next: ${table.team0(a, b, 0).toFixed(3)}, team 1 deals next: ${table.team0(a, b, 1).toFixed(3)}`);
}
saveWinTable(table, { strategy: spec, hands, built: new Date().toISOString() });

// Score states at the start of each hand in self-play games (the 0–0 start included).
const strat = makeStrategy(spec);
const states: [number, number][] = [];
for (let g = 0; states.length < 30000; g++) {
  const r = playGame({ players: [strat, strat, strat, strat], rules: DEFAULT_RULES, dealSeed: 900000 + g, playerSeed: g, firstDealer: g % 4 });
  const sc: [number, number] = [0, 0];
  for (const h of r.hands) {
    states.push([sc[0], sc[1]]);
    if (h.score) { sc[0] += h.score.points[0]; sc[1] += h.score.points[1]; }
  }
}
saveScoreStates(shuffle(states, makeRng(5)));
console.log(`saved ${states.length} score states`);
