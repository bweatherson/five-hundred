// Misère kitty-discard probe. For every misère contract in policy self-play, try
// several ways of choosing the bidder's three discards, play each hand out with
// the policy in all seats (same cards, same seed), and record the bidder's
// points minus the defenders'.
//
//   npx tsx src/probe-discard.ts run <deals> <seed> <from> [policy] > part.jsonl
//   npx tsx src/probe-discard.ts report part*.jsonl
import { readFileSync } from "node:fs";
import { dealCards, runAuction, PlayState, continuePlay } from "./game.ts";
import { makeRng, deriveSeed } from "./rng.ts";
import { makeContract, scoreHand, teamOf, DEFAULT_RULES } from "./rules.ts";
import { makeStrategy } from "./registry.ts";
import { meanCI } from "./tournament.ts";
import { Card, SUITS, Suit, isJoker, rankOf, suitOf } from "./cards.ts";
import { misereExcess, misereGapDiscard } from "./strategies/heuristic.ts";

type Chooser = (thirteen: Card[]) => Card[];

const rk = (c: Card) => (isJoker(c) ? 99 : rankOf(c));
const suitLen = (hand: Card[], su: Suit) => hand.filter((c) => !isJoker(c) && suitOf(c) === su).length;

/** Remove cards one at a time by the highest score (Joker always first). */
function greedy(score: (c: Card, hand: Card[]) => number): Chooser {
  return (thirteen) => {
    let hand = thirteen.slice();
    const out: Card[] = [];
    for (let i = 0; i < 3; i++) {
      const c = hand.includes("JK") ? "JK" : hand.reduce((a, b) => (score(b, hand) > score(a, hand) ? b : a));
      out.push(c);
      hand = hand.filter((x) => x !== c);
    }
    return out;
  };
}

/** Number of cards of the same suit, in the whole deck, lower than c that we don't hold. */
const lowerOut = (c: Card, hand: Card[]) => {
  const low = suitOf(c) === "D" || suitOf(c) === "H" ? 4 : 5;
  return rankOf(c) - low - hand.filter((x) => !isJoker(x) && suitOf(x) === suitOf(c) && rankOf(x) < rankOf(c)).length;
};

export const OPTIONS: { name: string; choose: Chooser }[] = [
  { name: "policy (gap)", choose: misereGapDiscard },
  { name: "three highest", choose: greedy((c) => rk(c)) },
  { name: "highest of the shortest suit", choose: greedy((c, h) => -suitLen(h, suitOf(c)) * 100 + rk(c)) },
  {
    name: "void a suit of ≤3, then highest",
    choose: (thirteen) => {
      const hand = thirteen.filter((c) => c !== "JK");
      const out: Card[] = thirteen.includes("JK") ? ["JK"] : [];
      const room = 3 - out.length;
      // Shortest suit that fits in the room, preferring the one with the highest top card.
      const fits = SUITS.filter((su) => { const n = suitLen(hand, su); return n > 0 && n <= room; })
        .sort((a, b) => suitLen(hand, a) - suitLen(hand, b) || Math.max(...hand.filter((c) => suitOf(c) === b).map(rankOf)) - Math.max(...hand.filter((c) => suitOf(c) === a).map(rankOf)));
      if (fits.length) out.push(...hand.filter((c) => suitOf(c) === fits[0]));
      const rest = hand.filter((c) => !out.includes(c)).sort((a, b) => rk(b) - rk(a));
      return [...out, ...rest].slice(0, 3);
    },
  },
  { name: "most excess, no length tiebreak", choose: greedy((c, h) => (misereExcess(h).get(c) ?? 0) * 100 + rk(c)) },
  { name: "excess, strong short-suit bias", choose: greedy((c, h) => (misereExcess(h).get(c) ?? 0) * 100 - suitLen(h, suitOf(c)) * 60 + rk(c)) },
  { name: "most unseen-lower cards (raw danger)", choose: greedy((c, h) => lowerOut(c, h) * 100 + rk(c)) },
  { name: "highest, then short suits", choose: greedy((c, h) => rk(c) * 10 - suitLen(h, suitOf(c)) * 5) },
];

function voids(hand: Card[]) {
  return SUITS.filter((su) => suitLen(hand, su) === 0).length;
}

function run(deals: number, seed: number, from: number, policySpec: string) {
  const policy = makeStrategy(policySpec);
  const players = [policy, policy, policy, policy];
  for (let i = from; i < from + deals; i++) {
    const dealer = i % 4;
    const deal = dealCards(makeRng(deriveSeed(seed, i)));
    const rng = makeRng(deriveSeed(seed, i, 7));
    const opts = { deal, dealer, players, scores: [0, 0] as [number, number], rules: DEFAULT_RULES, rng };
    const hands0 = deal.hands.map((h) => h.slice());
    const { auction, high } = runAuction(opts, hands0);
    if (!high) continue;
    const contract = makeContract(high.bid, high.seat);
    if (!contract.misere) continue;
    const bidder = high.seat;
    const thirteen = [...hands0[bidder], ...deal.kitty];
    const res: Record<string, number> = {};
    const keys: Record<string, string> = {};
    const cache = new Map<string, number>();
    for (const o of OPTIONS) {
      const discarded = o.choose(thirteen.slice());
      const key = discarded.slice().sort().join(",");
      keys[o.name] = key;
      if (!cache.has(key)) {
        const hands = hands0.map((h) => h.slice());
        hands[bidder] = thirteen.filter((c) => !discarded.includes(c));
        const state: PlayState = {
          contract, auction, dealer, scores: [0, 0], rules: DEFAULT_RULES, hands, discarded,
          tricks: [], current: [], ledSuit: null, leader: bidder, teamTricks: [0, 0],
        };
        continuePlay(state, players, makeRng(deriveSeed(seed, i, 1000)));
        const sc = scoreHand(state.contract, state.teamTricks, state.rules);
        const t = teamOf(bidder);
        cache.set(key, sc.points[t] - sc.points[1 - t]);
      }
      res[o.name] = cache.get(key)!;
    }
    const sub = `${contract.open ? "open" : "closed"}, ${thirteen.includes("JK") ? "Joker" : "no Joker"}, voids in 13: ${Math.min(voids(thirteen), 2)}${voids(thirteen) >= 2 ? "+" : ""}`;
    process.stdout.write(JSON.stringify({ sub, res, keys }) + "\n");
  }
}

function report(files: string[]) {
  const rows: { sub: string; res: Record<string, number>; keys: Record<string, string> }[] = files.flatMap((f) =>
    readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)));
  const names = OPTIONS.map((o) => o.name);
  const fmt = (m: { mean: number; ci95: number }) => `${m.mean >= 0 ? "+" : ""}${m.mean.toFixed(1)} ± ${m.ci95.toFixed(1)}`;
  console.log(`Misère discards: bidder's points relative to \`${names[0]}\` (${rows.length} hands).\n`);
  console.log(`| sub-case | n | ${names.slice(1).join(" | ")} | best-of-all |`);
  console.log(`|---|---|${names.slice(1).map(() => "---").join("|")}|---|`);
  const subs = ["(all)", ...[...new Set(rows.map((r) => r.sub))].sort()];
  for (const sub of subs) {
    const g = sub === "(all)" ? rows : rows.filter((r) => r.sub === sub);
    if (g.length < 200) continue;
    const cells = names.slice(1).map((n) => fmt(meanCI(g.map((r) => r.res[n] - r.res[names[0]]))));
    const best = fmt(meanCI(g.map((r) => Math.max(...names.map((n) => r.res[n])) - r.res[names[0]])));
    console.log(`| ${sub} | ${g.length} | ${cells.join(" | ")} | ${best} |`);
  }
  console.log(`\nSame discard as the policy: ${names.slice(1).map((n) => `${n} ${Math.round((100 * rows.filter((r) => r.keys[n] === r.keys[names[0]]).length) / rows.length)}%`).join(", ")}`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "run") {
  const [deals, seed, from, policy] = rest;
  run(Number(deals), Number(seed), Number(from ?? 0), policy ?? "tuned10");
} else if (cmd === "report") {
  report(rest);
} else {
  console.error("usage: probe-discard.ts run <deals> <seed> <from> [policy] | report files...");
  process.exit(1);
}
