// Single-decision probe. Plays deals with one strategy in all four seats; when a
// decision matches a situation in probe-situations.ts, it tries every candidate
// play on the same cards, plays each line out with the continuation strategy,
// and records the result for the deciding side. The real hand then carries on
// with the strategy's own choice, so later situations are found in it too.
//
//   npx tsx src/probe.ts run <deals> <seed> <from> [policy] [continuation] [misere] > part.jsonl
//   (a sixth argument "misere" skips every hand that isn't a misère contract)
//   npx tsx src/probe.ts report part*.jsonl
//
// Every player only ever sees its own view, so the continuations don't cheat;
// the hidden cards are simply the real ones from the deal.
import { readFileSync } from "node:fs";
import { dealCards, runAuction, PlayState, cloneState, applyPlay, continuePlay, isHandOver, seatToPlay, viewFor, stepPlay, defaultJokerSuit } from "./game.ts";
import { makeRng, deriveSeed } from "./rng.ts";
import { makeContract, scoreHand, teamOf, DEFAULT_RULES } from "./rules.ts";
import { makeStrategy } from "./registry.ts";
import { meanCI } from "./tournament.ts";
import { SITUATIONS } from "./probe-situations.ts";
import { Card, Suit, isJoker } from "./cards.ts";
import { Strategy } from "./player.ts";

interface Sample {
  sit: string;
  sub: string;
  trick: number;
  /** The policy's own card, and which option names it matches. */
  def: Card;
  /** Result (my side's points minus theirs) for each option, null if the option didn't apply. */
  res: Record<string, number | null>;
  defRes: number;
  /** Did the contract make, per option (null if n/a)? */
  made: Record<string, boolean | null>;
}

function playOut(s: PlayState, card: Card, players: Strategy[], seed: number, team: number, suit?: Suit) {
  const st = cloneState(s);
  const seat = seatToPlay(st);
  const named = st.ledSuit === null && isJoker(card) && st.contract.trump === null
    ? suit ?? players[seat].jokerSuit?.(viewFor(st, seat, makeRng(seed))) ?? defaultJokerSuit(st.hands[seat])
    : undefined;
  applyPlay(st, card, named);
  continuePlay(st, players, makeRng(seed));
  const sc = scoreHand(st.contract, st.teamTricks, st.rules);
  return { pts: sc.points[team] - sc.points[1 - team], made: sc.made };
}

function run(deals: number, seed: number, from: number, policySpec: string, contSpec: string, only?: string) {
  const policy = makeStrategy(policySpec);
  const cont = makeStrategy(contSpec);
  const players = [policy, policy, policy, policy];
  const contPlayers = [cont, cont, cont, cont];
  for (let i = from; i < from + deals; i++) {
    const dealer = i % 4;
    const deal = dealCards(makeRng(deriveSeed(seed, i)));
    const rng = makeRng(deriveSeed(seed, i, 7));
    const opts = { deal, dealer, players, scores: [0, 0] as [number, number], rules: DEFAULT_RULES, rng };
    const hands = deal.hands.map((h) => h.slice());
    const { auction, high } = runAuction(opts, hands);
    if (!high) continue;
    const contract = makeContract(high.bid, high.seat);
    if (only === "misere" && !contract.misere) continue;
    const bidder = high.seat;
    const thirteen = [...hands[bidder], ...deal.kitty];
    const discarded = policy.discard({ seat: bidder, dealer, rules: DEFAULT_RULES, scores: [0, 0], hand: thirteen.slice(), auction, rng, contract, kitty: deal.kitty.slice() });
    hands[bidder] = thirteen.filter((c) => !discarded.includes(c));
    const state: PlayState = {
      contract, auction, dealer, scores: [0, 0], rules: DEFAULT_RULES, hands, discarded,
      tricks: [], current: [], ledSuit: null, leader: bidder, teamTricks: [0, 0],
    };
    const fired = new Set<string>();
    let step = 0;
    while (!isHandOver(state)) {
      const seat = seatToPlay(state);
      const view = viewFor(state, seat, makeRng(0));
      for (const sit of SITUATIONS) {
        const sub = sit.match(view, state);
        if (sub === null) continue;
        const fkey = sit.name + (sit.key?.(view) ?? "");
        if (fired.has(fkey)) continue;
        const cards = sit.options.map((o) => o.choose(viewFor(state, seat, makeRng(0))));
        const suits = sit.options.map((o) => o.suit?.(viewFor(state, seat, makeRng(0))) ?? undefined);
        const keys = cards.map((c, k) => (c === null ? null : c + (suits[k] ?? "")));
        if (keys[0] === null || !keys.some((k) => k !== null && k !== keys[0])) continue;
        fired.add(fkey);
        const def = policy.play(viewFor(state, seat, makeRng(deriveSeed(seed, i, 100 + step))));
        const team = teamOf(seat);
        const cache = new Map<string, { pts: number; made: boolean }>();
        const eval1 = (c: Card, su?: Suit) => {
          const key = c + (su ?? "");
          if (!cache.has(key)) cache.set(key, playOut(state, c, contPlayers, deriveSeed(seed, i, 1000 + step), team, su));
          return cache.get(key)!;
        };
        const res: Record<string, number | null> = {};
        const made: Record<string, boolean | null> = {};
        sit.options.forEach((o, k) => {
          const c = cards[k];
          res[o.name] = c === null ? null : eval1(c, suits[k]).pts;
          made[o.name] = c === null ? null : eval1(c, suits[k]).made;
        });
        const d = eval1(def);
        const sample: Sample & { cards: (Card | null)[] } = {
          sit: sit.name, sub, trick: state.tricks.length + 1, def, res, defRes: d.pts, made, cards: keys,
        };
        process.stdout.write(JSON.stringify(sample) + "\n");
      }
      stepPlay(state, players, makeRng(deriveSeed(seed, i, 100 + step)));
      step++;
    }
  }
}

function fmt(m: { mean: number; ci95: number }) {
  return `${m.mean >= 0 ? "+" : ""}${m.mean.toFixed(1)} ± ${m.ci95.toFixed(1)}`;
}

function report(files: string[], minN: number) {
  const rows: (Sample & { cards: (Card | null)[] })[] = files.flatMap((f) =>
    readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)));
  for (const sit of SITUATIONS) {
    const rs = rows.filter((r) => r.sit === sit.name);
    if (rs.length === 0) continue;
    console.log(`\n## ${sit.name} (${rs.length} positions)\n${sit.describe}`);
    console.log(`Points for the deciding side, relative to ${"`"}${sit.options[0].name}${"`"}; "policy" = the policy's own choice.\n`);
    const subs = ["(all)", ...[...new Set(rs.map((r) => r.sub))].sort()];
    const names = sit.options.map((o) => o.name);
    console.log(`| sub-case | n | ${names.slice(1).map((n) => `${n}`).join(" | ")} | policy | policy picks |`);
    console.log(`|---|---|${names.slice(1).map(() => "---").join("|")}|---|---|`);
    for (const sub of subs) {
      const g = sub === "(all)" ? rs : rs.filter((r) => r.sub === sub);
      if (g.length < minN) continue;
      const base = names[0];
      const cells = names.slice(1).map((n) => {
        const xs = g.filter((r) => r.res[n] !== null).map((r) => r.res[n]! - r.res[base]!);
        return xs.length >= 10 ? `${fmt(meanCI(xs))}${xs.length < g.length ? ` (n=${xs.length})` : ""}` : "–";
      });
      const pol = fmt(meanCI(g.map((r) => r.defRes - r.res[base]!)));
      const picks = names.map((n, k) => [n, g.filter((r) => r.cards[k] === r.def).length] as const)
        .filter(([, c]) => c > 0).map(([n, c]) => `${n} ${Math.round((100 * c) / g.length)}%`);
      const other = g.filter((r) => !r.cards.includes(r.def)).length;
      if (other) picks.push(`other ${Math.round((100 * other) / g.length)}%`);
      console.log(`| ${sub} | ${g.length} | ${cells.join(" | ")} | ${pol} | ${picks.join(", ")} |`);
    }
  }
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "run") {
  const [deals, seed, from, policy, cont, only] = rest;
  run(Number(deals), Number(seed), Number(from ?? 0), policy ?? "tuned6", cont ?? policy ?? "tuned6", only);
} else if (cmd === "report") {
  const minIdx = rest.indexOf("--min");
  const minN = minIdx >= 0 ? Number(rest[minIdx + 1]) : 40;
  report(rest.filter((_, k) => k !== minIdx && k !== minIdx + 1), minN);
} else {
  console.error("usage: probe.ts run <deals> <seed> <from> [policy] [continuation] | report files... [--min N]");
  process.exit(1);
}
