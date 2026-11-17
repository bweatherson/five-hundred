// Usage:
//   npm run match -- --a heuristic --b random --deals 2000
//   npm run match -- --a bold --b cautious --games 500
//   npm run match -- --a "heuristic:partnerTricks=2" --b heuristic --deals 5000 --seed 7
//   npm run match -- --list
import { STRATEGIES, makeStrategy } from "./registry.ts";
import { SideStats, duplicateGames, duplicateHands } from "./tournament.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (process.argv.includes("--list")) {
  for (const [k, v] of Object.entries(STRATEGIES)) console.log(`${k.padEnd(12)} ${v.describe}`);
  process.exit(0);
}

const aSpec = arg("a") ?? "heuristic";
const bSpec = arg("b") ?? "random";
const seed = Number(arg("seed") ?? 1);
const deals = arg("deals") ? Number(arg("deals")) : undefined;
const games = arg("games") ? Number(arg("games")) : undefined;
const a = makeStrategy(aSpec);
const b = makeStrategy(bSpec);

const pct = (x: number, n: number) => (n === 0 ? "  –  " : `${((100 * x) / n).toFixed(1)}%`);

function printSide(label: string, s: SideStats) {
  console.log(`  ${label}`);
  console.log(`    contracts declared: ${s.contractsWon} of ${s.hands} hands (${pct(s.contractsWon, s.hands)}), made ${pct(s.contractsMade, s.contractsWon)}`);
  console.log(`    misère: ${s.misereBids} bid, made ${pct(s.misereMade, s.misereBids)}`);
  const rows = [...s.byBid.entries()].sort((x, y) => y[1][0] - x[1][0]).slice(0, 8);
  console.log(`    most common contracts: ${rows.map(([k, [n, m]]) => `${k} ×${n} (${pct(m, n)} made)`).join(", ")}`);
}

if (games === undefined || deals !== undefined) {
  const n = deals ?? 2000;
  const t0 = Date.now();
  const r = duplicateHands(a, b, n, seed);
  console.log(`Duplicate hands: ${aSpec} vs ${bSpec}, ${n} deals × 2 orientations, seed ${seed} (${Date.now() - t0} ms)`);
  console.log(`  ${aSpec} gains ${r.diff.mean.toFixed(1)} ± ${r.diff.ci95.toFixed(1)} points per deal (95% CI)`);
  printSide(aSpec, r.a);
  printSide(bSpec, r.b);
}

if (games !== undefined) {
  const t0 = Date.now();
  const r = duplicateGames(a, b, games, seed);
  console.log(`Duplicate games to 500: ${aSpec} vs ${bSpec}, ${r.games} games, seed ${seed} (${Date.now() - t0} ms)`);
  console.log(`  ${aSpec} wins ${r.aWins}, ${bSpec} wins ${r.bWins}, unfinished ${r.unfinished}`);
  console.log(`  ${aSpec} win rate ${(100 * r.winRate.mean).toFixed(1)}% ± ${(100 * r.winRate.ci95).toFixed(1)}% (95% CI)`);
  console.log(`  average ${r.avgHandsPerGame.toFixed(1)} hands per game`);
}
