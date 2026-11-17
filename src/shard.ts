// Worker for parallel runs: plays deals [from, from+count) and prints JSON.
import { makeStrategy } from "./registry.ts";
import { duplicateHands, duplicateScoredHands } from "./tournament.ts";
import { loadWinTable, statesFor } from "./winprob.ts";

const [aSpec, bSpec, from, count, seed, mode] = process.argv.slice(2);
const a = makeStrategy(aSpec), b = makeStrategy(bSpec);
const r = mode === "win" || mode === "near"
  ? duplicateScoredHands(a, b, Number(count), Number(seed), statesFor(mode), loadWinTable(), undefined, Number(from))
  : duplicateHands(a, b, Number(count), Number(seed), undefined, Number(from));
const ser = (s: typeof r.a) => ({ ...s, byBid: [...s.byBid.entries()] });
process.stdout.write(JSON.stringify({ diffs: r.diffs, a: ser(r.a), b: ser(r.b) }));
