// Win probability for any game score, assuming both sides keep playing like
// a reference strategy whose hand results don't depend on the score.
//
// 1. Self-play many hands and record each result relative to the bidding side
//    (bidders' change, defenders' change), plus how often everyone passes.
// 2. Value iteration over all live scores (−490 … 490 in steps of 10):
//    W(s0, s1) = P(team 0 eventually wins), with either team equally likely to
//    win the bidding on any hand.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { Strategy } from "./player.ts";
import { DEFAULT_RULES, RulesConfig, gameWinner, teamOf } from "./rules.ts";
import { dealCards, playHand } from "./game.ts";
import { deriveSeed, makeRng } from "./rng.ts";

export const MIN_LIVE = -490;
export const MAX_LIVE = 490;
const N = (MAX_LIVE - MIN_LIVE) / 10 + 1; // 99

export interface Outcomes {
  hands: number;
  /** Redeals (all pass). */
  passes: number;
  /**
   * Hand results relative to the dealing team:
   * "dealerTeamDelta,otherTeamDelta,bidderIsDealerTeam(0/1)" -> count
   */
  counts: Record<string, number>;
}

export function collectOutcomes(s: Strategy, hands: number, seed = 1, rules: RulesConfig = DEFAULT_RULES): Outcomes {
  const out: Outcomes = { hands, passes: 0, counts: {} };
  const players = [s, s, s, s];
  for (let i = 0; i < hands; i++) {
    const dealer = i % 4;
    const r = playHand({
      deal: dealCards(makeRng(deriveSeed(seed, i))), dealer, players, scores: [0, 0], rules,
      rng: makeRng(deriveSeed(seed, i, 9)),
    });
    if (!r.contract || !r.score) { out.passes++; continue; }
    const dt = teamOf(dealer);
    const k = `${r.score.points[dt]},${r.score.points[1 - dt]},${teamOf(r.contract.bidder) === dt ? 1 : 0}`;
    out.counts[k] = (out.counts[k] ?? 0) + 1;
  }
  return out;
}

/**
 * Game-win probabilities, by score and by which team deals the next hand.
 * Methods take `dealerTeam` (the team dealing the next hand); if omitted, the
 * two cases are averaged.
 */
export class WinTable {
  constructor(readonly w: Float64Array, readonly rules: RulesConfig = DEFAULT_RULES) {}

  /** P(team 0 wins) at the given scores (either may already be past an end). */
  team0(s0: number, s1: number, dealerTeam?: 0 | 1): number {
    if (s0 >= this.rules.winScore && s1 < this.rules.winScore) return 1;
    if (s1 >= this.rules.winScore && s0 < this.rules.winScore) return 0;
    if (s0 <= this.rules.loseScore) return 0;
    if (s1 <= this.rules.loseScore) return 1;
    const i = Math.round((s0 - MIN_LIVE) / 10);
    const j = Math.round((s1 - MIN_LIVE) / 10);
    if (dealerTeam === undefined) return 0.5 * (this.w[i * N + j] + this.w[N * N + i * N + j]);
    return this.w[dealerTeam * N * N + i * N + j];
  }

  /** P(team 0 wins) after a hand, using the bidder tie-break if both pass 500. */
  after(scores: [number, number], bidderTeam: 0 | 1, nextDealerTeam?: 0 | 1): number {
    const w = gameWinner(scores, bidderTeam, this.rules);
    if (w !== null) return w === 0 ? 1 : 0;
    return this.team0(scores[0], scores[1], nextDealerTeam);
  }

  /** P(the given team wins) with scores listed as [team 0, team 1]. */
  forTeam(team: 0 | 1, scores: [number, number], dealerTeam?: 0 | 1): number {
    const p = this.team0(scores[0], scores[1], dealerTeam);
    return team === 0 ? p : 1 - p;
  }
}

export function solveWinTable(o: Outcomes, rules: RulesConfig = DEFAULT_RULES): WinTable {
  const outs = Object.entries(o.counts).map(([k, n]) => {
    const [a, b, dBid] = k.split(",").map(Number);
    return { a, b, dBid, p: n / o.hands };
  });
  const pPass = o.passes / o.hands;
  // w[d][i][j]: P(team 0 wins) when team d deals the next hand.
  const w = new Float64Array(2 * N * N).fill(0.5);
  const idx = (d: number, s0: number, s1: number) => d * N * N + ((s0 - MIN_LIVE) / 10) * N + (s1 - MIN_LIVE) / 10;
  const value = (s0: number, s1: number, bidderTeam: 0 | 1, d: number): number => {
    const win = gameWinner([s0, s1], bidderTeam, rules);
    if (win !== null) return win === 0 ? 1 : 0;
    return w[idx(d, s0, s1)];
  };
  for (let iter = 0; iter < 3000; iter++) {
    let delta = 0;
    for (const d of [0, 1] as const) {
      const nd = 1 - d;
      for (let i = 0; i < N; i++) {
        const s0 = MIN_LIVE + i * 10;
        for (let j = 0; j < N; j++) {
          const s1 = MIN_LIVE + j * 10;
          let v = pPass * w[idx(nd, s0, s1)];
          for (const { a, b, dBid, p } of outs) {
            // a = dealing team's change, b = other team's change
            const bidderTeam = (dBid ? d : nd) as 0 | 1;
            v += d === 0 ? p * value(s0 + a, s1 + b, bidderTeam, nd) : p * value(s0 + b, s1 + a, bidderTeam, nd);
          }
          const k = idx(d, s0, s1);
          delta = Math.max(delta, Math.abs(v - w[k]));
          w[k] = v;
        }
      }
    }
    if (delta < 1e-7) break;
  }
  return new WinTable(w, rules);
}

const TABLE_PATH = fileURLToPath(new URL("../data/winprob.json", import.meta.url));
let cached: WinTable | null = null;

/** The saved table (built by `npm run build-winprob`). */
export function loadWinTable(): WinTable {
  if (cached) return cached;
  if (!existsSync(TABLE_PATH)) throw new Error("data/winprob.json missing: run `npm run build-winprob`");
  const j = JSON.parse(readFileSync(TABLE_PATH, "utf8"));
  if (j.w.length !== 2 * N * N) throw new Error("data/winprob.json is the old format: run `npm run build-winprob`");
  cached = new WinTable(Float64Array.from(j.w));
  return cached;
}

export function saveWinTable(t: WinTable, meta: Record<string, unknown>) {
  mkdirSync(dirname(TABLE_PATH), { recursive: true });
  writeFileSync(TABLE_PATH, JSON.stringify({ ...meta, w: Array.from(t.w, (x) => Math.round(x * 1e6) / 1e6) }));
}

// ---------------------------------------------------------------------------
// Realistic mid-game score states, sampled from self-play games.
// ---------------------------------------------------------------------------

const STATES_PATH = fileURLToPath(new URL("../data/score-states.json", import.meta.url));

export function saveScoreStates(states: [number, number][]) {
  mkdirSync(dirname(STATES_PATH), { recursive: true });
  writeFileSync(STATES_PATH, JSON.stringify(states));
}

let cachedStates: [number, number][] | null = null;
export function loadScoreStates(): [number, number][] {
  if (!cachedStates) cachedStates = JSON.parse(readFileSync(STATES_PATH, "utf8"));
  return cachedStates!;
}

/** Score states for a benchmark mode: "win" uses all, "near" only those where either side has 400+. */
export function statesFor(mode: string): [number, number][] {
  const all = loadScoreStates();
  return mode === "near" ? all.filter((x) => Math.max(x[0], x[1]) >= 400) : all;
}
