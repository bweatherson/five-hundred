// How often does the bidding side lead a trump when the opponents have none left?
// Usage: npx tsx src/probe-draw.ts [strategy] [deals]
import { Card } from "./cards.ts";
import { dealCards, playHand } from "./game.ts";
import { PlayView, Strategy } from "./player.ts";
import { makeStrategy } from "./registry.ts";
import { DEFAULT_RULES, isTrump } from "./rules.ts";
import { deriveSeed, makeRng } from "./rng.ts";
import { knownVoids } from "./strategies/sampling.ts";
import { inferredOutOfTrumps } from "./strategies/heuristic.ts";
import { sameTeam, unseenCards } from "./strategies/util.ts";

const spec = process.argv[2] ?? "tuned13";
const deals = Number(process.argv[3] ?? 20000);
const inner = makeStrategy(spec);

type Row = { n: number; trumpLead: number; oppsHaveTrump: number };
const rows: Record<string, Row> = {};
const add = (k: string, led: boolean, have: boolean) => {
  const r = (rows[k] ??= { n: 0, trumpLead: 0, oppsHaveTrump: 0 });
  r.n++; if (led) r.trumpLead++; if (have) r.oppsHaveTrump++;
};

let hands: Card[][] = [];
const watcher: Strategy = {
  name: "watch",
  bid: (v) => inner.bid(v),
  discard: (v) => inner.discard(v),
  jokerSuit: inner.jokerSuit?.bind(inner),
  play(v: PlayView) {
    const card = inner.play(v);
    const trump = v.contract.trump;
    if (v.ledSuit !== null || trump === null || v.contract.misere || !sameTeam(v.seat, v.contract.bidder)) return card;
    if (!v.hand.some((c) => isTrump(c, trump))) return card;
    const unseen = unseenCards(v);
    if (!unseen.some((c) => isTrump(c, trump))) return card;
    const opps = v.activeSeats.filter((s) => !sameTeam(s, v.seat));
    const played = new Set<Card>(v.tricks.flatMap((t) => t.plays.map((p) => p.card)));
    const have = opps.some((o) => hands[o].some((c) => isTrump(c, trump) && !played.has(c)));
    const voids = knownVoids(v);
    const shown = opps.every((o) => voids[o].has(trump));
    const inf1 = opps.every((o) => voids[o].has(trump) || inferredOutOfTrumps(v, o, unseen, 1));
    const inf2 = opps.every((o) => voids[o].has(trump) || inferredOutOfTrumps(v, o, unseen, 2));
    const led = isTrump(card, trump);
    const k = shown ? "A both shown out" : inf1 ? "B inferred (tol 1)" : inf2 ? "C inferred (tol 2 only)" : "D otherwise";
    add(k, led, have);
    return card;
  },
};

for (let i = 0; i < deals; i++) {
  const deal = dealCards(makeRng(deriveSeed(7, i)));
  hands = deal.hands;
  playHand({ deal, dealer: i % 4, players: [watcher, watcher, watcher, watcher], scores: [0, 0], rules: DEFAULT_RULES, rng: makeRng(deriveSeed(7, i, 1)) });
}
console.log(`${spec}, ${deals} deals. Bidding-side leads in trump contracts, holding a trump, with trumps unseen:`);
for (const k of Object.keys(rows).sort()) {
  const r = rows[k];
  console.log(`${k.padEnd(26)} ${String(r.n).padStart(7)} leads  led a trump ${(100 * r.trumpLead / r.n).toFixed(1).padStart(5)}%  opponents really had one ${(100 * r.oppsHaveTrump / r.n).toFixed(1).padStart(5)}%`);
}
