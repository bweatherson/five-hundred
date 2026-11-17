// Fit the trick estimate to data from src/calibrate.ts.
// Usage: npx tsx src/fit-estimate.ts file1.jsonl file2.jsonl ...
import { readFileSync } from "node:fs";
import { NT_FEATURES, SUIT_FEATURES } from "./strategies/features.ts";
import { fit } from "./fit-estimate-lib.ts";

interface Row { s: string; f: number[]; old: number; t: number }
const rows: Row[] = [];
for (const file of process.argv.slice(2)) {
  for (const line of readFileSync(file, "utf8").split("\n")) if (line) rows.push(JSON.parse(line));
}

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

function report(label: string, rs: Row[], names: readonly string[], weightFn: (r: Row) => number) {
  const w = rs.map(weightFn);
  const y = rs.map((r) => r.t);
  const beta = fit(rs.map((r) => r.f), y, w);
  const oldBeta = fit(rs.map((r) => [1, r.old]), y, w);
  const sw = w.reduce((s, x) => s + x, 0);
  const mean = rs.reduce((s, r, i) => s + w[i] * r.t, 0) / sw;
  const sse = (pred: (r: Row) => number) => rs.reduce((s, r, i) => s + w[i] * (r.t - pred(r)) ** 2, 0) / sw;
  const sst = sse(() => mean);
  const eNew = sse((r) => dot(beta, r.f));
  const eOld = sse((r) => oldBeta[0] + oldBeta[1] * r.old);
  // Raw old estimate as the bidder uses it: hand estimate + 2 (partner 1.5 + kitty 0.5).
  const eRaw = sse((r) => r.old + 2);
  console.log(`\n${label}: n=${rs.length}, weighted n=${sw.toFixed(0)}, mean tricks ${mean.toFixed(2)}`);
  console.log(`  RMSE  old as used (est+2): ${Math.sqrt(eRaw).toFixed(3)}   old rescaled (${oldBeta[0].toFixed(2)} + ${oldBeta[1].toFixed(2)}·est): ${Math.sqrt(eOld).toFixed(3)}   new: ${Math.sqrt(eNew).toFixed(3)}`);
  console.log(`  R²    old rescaled ${(1 - eOld / sst).toFixed(3)}   new ${(1 - eNew / sst).toFixed(3)}`);
  console.log("  coefficients: " + names.map((n, i) => `${n} ${beta[i].toFixed(3)}`).join(", "));
  // Residuals by old-estimate band, to show where the old estimate is biased.
  const bands = new Map<number, [number, number, number]>();
  rs.forEach((r, i) => {
    if (w[i] === 0) return;
    const b = Math.floor(r.old + 2);
    const e = bands.get(b) ?? [0, 0, 0];
    e[0]++; e[1] += r.t; e[2] += dot(beta, r.f);
    bands.set(b, e);
  });
  console.log("  old est+2 band → n, actual mean, new-pred mean:");
  for (const [b, [n, t, p]] of [...bands].sort((a, b) => a[0] - b[0])) {
    if (n > 200) console.log(`    ${b}: ${n}  ${(t / n).toFixed(2)}  ${(p / n).toFixed(2)}`);
  }
  return beta;
}

const suit = rows.filter((r) => r.s !== "NT");
const nt = rows.filter((r) => r.s === "NT");
const near = (r: Row) => (r.old + 2.75 >= 5 ? 1 : 0);
const out = {
  suitAll: report("Suits, all hands", suit, SUIT_FEATURES, () => 1),
  suitNear: report("Suits, hands near bidding range (old est + 2.75 ≥ 5)", suit, SUIT_FEATURES, near),
  ntAll: report("No-trumps, all hands", nt, NT_FEATURES, () => 1),
  ntNear: report("No-trumps, near bidding range", nt, NT_FEATURES, near),
};
console.log("\n" + JSON.stringify(out));
