// Play several variants against one baseline on the same deals and print a table.
// Usage:
//   npm run sweep -- --base heuristic --deals 10000 \
//     "heuristic:aggression=0.5" "heuristic:aggression=1"
import { makeStrategy } from "./registry.ts";
import { duplicateGames, duplicateHands, duplicateScoredHands } from "./tournament.ts";
import { loadWinTable, statesFor } from "./winprob.ts";
import { parallelDuplicateHands } from "./parallel.ts";

const argv = process.argv.slice(2);
const opt = (name: string, dflt: string) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return dflt;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const baseSpec = opt("base", "heuristic");
const deals = Number(opt("deals", "10000"));
const games = Number(opt("games", "0"));
const seed = Number(opt("seed", "1"));
const jobs = Number(opt("jobs", "1"));
const mode = opt("mode", "points") as "points" | "win" | "near";
const variants = argv;

const base = makeStrategy(baseSpec);
const pct = (x: number, n: number) => (n === 0 ? "   –  " : `${((100 * x) / n).toFixed(1).padStart(5)}%`);

if (mode !== "points") console.log(`Mode: ${mode} — hands start from realistic game scores${mode === "near" ? " where either side has 400+" : ""}; first column is win-probability gain (percentage points per deal).`);
console.log(`Baseline: ${baseSpec}. ${deals} duplicate deals${games ? `, ${games * 2} games` : ""}, seed ${seed}.`);
console.log(
  ["variant".padEnd(58), "pts/deal".padStart(14), "declares", "  made", " misère", "mis.made", games ? "  win%" : ""].join("  "),
);
for (const spec of variants) {
  const v = makeStrategy(spec);
  const r = jobs > 1
    ? await parallelDuplicateHands(spec, baseSpec, deals, seed, jobs, mode)
    : mode !== "points"
      ? duplicateScoredHands(v, base, deals, seed, statesFor(mode), loadWinTable())
      : duplicateHands(v, base, deals, seed);
  const s = r.a;
  let win = "";
  if (games) {
    const g = duplicateGames(v, base, games, seed);
    win = `${(100 * g.winRate.mean).toFixed(1)}±${(100 * g.winRate.ci95).toFixed(1)}`;
  }
  console.log(
    [
      spec.padEnd(58),
      `${r.diff.mean >= 0 ? "+" : ""}${r.diff.mean.toFixed(1)} ± ${r.diff.ci95.toFixed(1)}`.padStart(14),
      pct(s.contractsWon, s.hands).padStart(8),
      pct(s.contractsMade, s.contractsWon),
      String(s.misereBids).padStart(7),
      pct(s.misereMade, s.misereBids).padStart(8),
      win,
    ].join("  "),
  );
}
