// How do no-trump contracts fare by the bidder's aces (before the kitty)?
// Usage: npx tsx src/probe-nt.ts [strategy] [deals]
import { dealCards, playHand } from "./game.ts";
import { makeStrategy } from "./registry.ts";
import { DEFAULT_RULES } from "./rules.ts";
import { deriveSeed, makeRng } from "./rng.ts";

const spec = process.argv[2] ?? "tuned14";
const deals = Number(process.argv[3] ?? 50000);
const s = makeStrategy(spec);
type Row = { n: number; made: number; pts: number; tricks: number };
const rows = new Map<string, Row>();
let all = 0;
for (let i = 0; i < deals; i++) {
  const deal = dealCards(makeRng(deriveSeed(11, i)));
  const r = playHand({ deal, dealer: i % 4, players: [s, s, s, s], scores: [0, 0], rules: DEFAULT_RULES, rng: makeRng(deriveSeed(11, i, 1)) });
  if (!r.contract || r.contract.misere) continue;
  all++;
  if (r.contract.trump !== null) continue;
  const b = r.contract.bidder, team = b % 2;
  const h = deal.hands[b];
  const aces = h.filter((c) => c[0] === "A").length;
  const k = `${h.includes("JK") ? "Joker" : "no Joker"}, ${aces} ace${aces === 1 ? "" : "s"}`;
  const row = rows.get(k) ?? { n: 0, made: 0, pts: 0, tricks: 0 };
  row.n++;
  if (r.teamTricks[team] >= (r.contract.bid as { tricks: number }).tricks) row.made++;
  row.pts += r.score!.points[team];
  row.tricks += r.teamTricks[team] - (r.contract.bid as { tricks: number }).tricks;
  rows.set(k, row);
}
console.log(`${spec}, ${deals} deals, ${all} suit/NT contracts. No-trump contracts by the bidder's hand:`);
for (const [k, r] of [...rows].sort()) {
  console.log(`${k.padEnd(18)} ${String(r.n).padStart(6)}  made ${(100 * r.made / r.n).toFixed(0).padStart(3)}%  avg score ${(r.pts / r.n).toFixed(0).padStart(5)}  tricks vs bid ${(r.tricks / r.n).toFixed(2).padStart(6)}`);
}
