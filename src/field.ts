// Test variants of a base player against a field of other players.
// Each deal is played in duplicate by (variant vs opponent) and by (base vs opponent), with the
// opponent taken from the field in rotation. The paired difference is the variant's gain over the
// base against that opponent, on the same cards.
//
//   npx tsx src/field.ts --base tuned12 --field heuristic,tuned,tuned2 --deals 40000 --jobs 8 [--seed 1] variants...
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { makeStrategy } from "./registry.ts";
import { duplicateHands, meanCI } from "./tournament.ts";

const argv = process.argv.slice(2);
const opt = (name: string, dflt: string) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return dflt;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const baseSpec = opt("base", "tuned20");
const field = opt("field", "heuristic,tuned,tuned2,tuned3,tuned4,tuned5,tuned6,tuned7,tuned8,tuned9,tuned10").split(",");
const deals = Number(opt("deals", "10000"));
const seed = Number(opt("seed", "1"));
const jobs = Number(opt("jobs", "1"));
const shard = opt("shard", "");
const variants = argv;

type Row = { opp: number; d: number[] };

function runRange(from: number, count: number): Row[] {
  const base = makeStrategy(baseSpec);
  const opps = field.map((f) => makeStrategy(f));
  const vs = variants.map((s) => makeStrategy(s));
  const rows: Row[] = [];
  for (let i = from; i < from + count; i++) {
    const k = i % field.length;
    const b = duplicateHands(base, opps[k], 1, seed, undefined, i).diffs[0];
    rows.push({ opp: k, d: vs.map((v) => duplicateHands(v, opps[k], 1, seed, undefined, i).diffs[0] - b) });
  }
  return rows;
}

if (shard) {
  const [from, count] = shard.split(":").map(Number);
  process.stdout.write(JSON.stringify(runRange(from, count)));
} else {
  const self = fileURLToPath(import.meta.url);
  const tsx = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
  const per = Math.ceil(deals / jobs);
  const parts = await Promise.all(Array.from({ length: jobs }, (_, j) => new Promise<Row[]>((resolve, reject) => {
    const from = j * per, count = Math.max(0, Math.min(per, deals - from));
    const args = [self, "--base", baseSpec, "--field", field.join(","), "--seed", String(seed), "--shard", `${from}:${count}`, ...variants];
    const p = spawn(tsx, args, { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", (code) => (code === 0 ? resolve(JSON.parse(out)) : reject(new Error(`shard ${j} exited ${code}`))));
  })));
  const rows = parts.flat();
  // Groups: each half of the field, and the whole field.
  const half = Math.ceil(field.length / 2);
  const groups: [string, (r: Row) => boolean][] = [
    ["all", () => true],
    [`${field[0]}–${field[half - 1]}`, (r) => r.opp < half],
    [`${field[half]}–${field.at(-1)}`, (r) => r.opp >= half],
  ];
  const fmt = (xs: number[]) => { const m = meanCI(xs); return `${m.mean >= 0 ? "+" : ""}${m.mean.toFixed(1)} ± ${m.ci95.toFixed(1)}`; };
  console.log(`Gain over ${baseSpec} against a field (${field.join(", ")}), ${deals} duplicate deals, seed ${seed}.\n`);
  console.log(`| variant | ${groups.map((g) => g[0]).join(" | ")} |`);
  console.log(`|---|${groups.map(() => "---").join("|")}|`);
  variants.forEach((v, j) => {
    console.log(`| ${v} | ${groups.map(([, f]) => fmt(rows.filter(f).map((r) => r.d[j]))).join(" | ")} |`);
  });
}
