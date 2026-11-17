// How much does the auction tell the declarer beyond their own hand?
// Self-play real auctions; for each suit/NT contract, compare the tricks the
// declaring side took with the fitted hand-only prediction, and fit the
// difference on what partner and the opponents bid.
// Usage: npx tsx src/calibrate-auction.ts <strategy> <deals> <seed>
import { makeStrategy } from "./registry.ts";
import { DEFAULT_RULES, Strain, teamOf } from "./rules.ts";
import { dealCards, playHand } from "./game.ts";
import { deriveSeed, makeRng } from "./rng.ts";
import { fittedTricks } from "./strategies/features.ts";
import { fit } from "./fit-estimate-lib.ts";

const [spec = "tuned5", dealsArg = "20000", seedArg = "1"] = process.argv.slice(2);
const st = makeStrategy(spec);
const deals = Number(dealsArg), seed = Number(seedArg);

export const AUCTION_FEATURES = [
  "const", "partner bid this strain", "partner bid another strain", "partner passed first",
  "an opponent bid this strain", "opponents' suit bids (count of strains)", "level-6", "NT",
] as const;

const X: number[][] = [], y: number[] = [];
const byLevel = new Map<number, [number, number, number]>();
for (let i = 0; i < deals; i++) {
  const deal = dealCards(makeRng(deriveSeed(seed, i)));
  const r = playHand({ deal, dealer: i % 4, players: [st, st, st, st], scores: [0, 0], rules: DEFAULT_RULES, rng: makeRng(deriveSeed(seed, i, 3)) });
  if (!r.contract || r.contract.misere || r.contract.bid.kind !== "suit") continue;
  const b = r.contract.bidder, partner = (b + 2) % 4;
  const strain = r.contract.bid.strain as Strain;
  const pred = fittedTricks(deal.hands[b], strain);
  const strainsOf = (pred2: (s: number) => boolean) => new Set(
    r.auction.filter((e) => pred2(e.seat) && e.bid?.kind === "suit").map((e) => (e.bid as { strain: Strain }).strain));
  const pS = strainsOf((s) => s === partner);
  const oS = strainsOf((s) => teamOf(s) !== teamOf(b));
  const pFirst = r.auction.find((e) => e.seat === partner);
  const level = r.contract.bid.tricks;
  X.push([1, pS.has(strain) ? 1 : 0, [...pS].some((s) => s !== strain) ? 1 : 0, pFirst && pFirst.bid === null ? 1 : 0,
    oS.has(strain) ? 1 : 0, oS.size, level - 6, strain === "NT" ? 1 : 0]);
  const t = r.teamTricks[teamOf(b)];
  y.push(t - pred);
  const e = byLevel.get(level) ?? [0, 0, 0];
  e[0]++; e[1] += t - pred; e[2] += t >= level ? 1 : 0;
  byLevel.set(level, e);
}
const beta = fit(X, y, y.map(() => 1));
const counts = AUCTION_FEATURES.map((_, k) => X.filter((x) => x[k] !== 0).length);
console.log(`${X.length} contracts. Actual tricks minus the hand-only prediction, fitted on the auction:`);
AUCTION_FEATURES.forEach((n, k) => console.log(`  ${n.padEnd(42)} ${beta[k] >= 0 ? "+" : ""}${beta[k].toFixed(2)}   (n=${counts[k]})`));
console.log("By level: n, mean (actual − predicted), made%");
for (const [l, [n, d, m]] of [...byLevel].sort((a, b) => a[0] - b[0])) {
  console.log(`  ${l}: ${n}  ${(d / n).toFixed(2)}  ${(100 * m / n).toFixed(1)}%`);
}
