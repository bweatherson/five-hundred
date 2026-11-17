// Duplicate tournaments: every deal is played twice with the partnerships
// swapped, so both strategies hold exactly the same cards. This removes most of
// the luck of the deal from the comparison.
import { Strategy } from "./player.ts";
import { DEFAULT_RULES, RulesConfig, bidLabel, teamOf } from "./rules.ts";
import { HandResult, dealCards, playGame, playHand } from "./game.ts";
import { deriveSeed, makeRng } from "./rng.ts";

export interface SideStats {
  hands: number;
  contractsWon: number;
  contractsMade: number;
  misereBids: number;
  misereMade: number;
  pointsFor: number;
  /** Bid label -> [times played as declarer, times made]. */
  byBid: Map<string, [number, number]>;
}

export function emptyStats(): SideStats {
  return { hands: 0, contractsWon: 0, contractsMade: 0, misereBids: 0, misereMade: 0, pointsFor: 0, byBid: new Map() };
}

function record(stats: SideStats, r: HandResult, team: 0 | 1) {
  stats.hands++;
  if (!r.contract || !r.score) return;
  stats.pointsFor += r.score.points[team];
  if (teamOf(r.contract.bidder) !== team) return;
  stats.contractsWon++;
  if (r.score.made) stats.contractsMade++;
  if (r.contract.misere) {
    stats.misereBids++;
    if (r.score.made) stats.misereMade++;
  }
  const label = bidLabel(r.contract.bid);
  const entry = stats.byBid.get(label) ?? [0, 0];
  entry[0]++;
  if (r.score.made) entry[1]++;
  stats.byBid.set(label, entry);
}

function seatsFor(a: Strategy, b: Strategy): Strategy[] {
  return [a, b, a, b];
}

export interface MeanCI {
  mean: number;
  /** Half-width of the 95% confidence interval. */
  ci95: number;
  n: number;
}

export function meanCI(xs: number[]): MeanCI {
  const n = xs.length;
  const mean = xs.reduce((s, x) => s + x, 0) / n;
  const variance = n > 1 ? xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1) : 0;
  return { mean, ci95: 1.96 * Math.sqrt(variance / n), n };
}

export interface HandsMatchResult {
  /** A's points minus B's points per deal, summed over both orientations. */
  diff: MeanCI;
  diffs: number[];
  a: SideStats;
  b: SideStats;
}

/** Play `deals` deals in duplicate (2 × deals hands), from a 0–0 score. */
export function duplicateHands(
  a: Strategy, b: Strategy, deals: number, seed = 1, rules: RulesConfig = DEFAULT_RULES, start = 0,
): HandsMatchResult {
  const diffs: number[] = [];
  const sa = emptyStats();
  const sb = emptyStats();
  for (let i = start; i < start + deals; i++) {
    const dealSeed = deriveSeed(seed, i);
    const dealer = i % 4;
    let d = 0;
    for (const aTeam of [0, 1] as const) {
      const players = aTeam === 0 ? seatsFor(a, b) : seatsFor(b, a);
      const r = playHand({
        deal: dealCards(makeRng(dealSeed)), dealer, players, scores: [0, 0], rules,
        rng: makeRng(deriveSeed(seed, i, 1 + aTeam)),
      });
      const bTeam = (1 - aTeam) as 0 | 1;
      record(sa, r, aTeam);
      record(sb, r, bTeam);
      if (r.score) d += r.score.points[aTeam] - r.score.points[bTeam];
    }
    diffs.push(d);
  }
  return { diff: meanCI(diffs), diffs, a: sa, b: sb };
}

export interface GamesMatchResult {
  aWins: number;
  bWins: number;
  unfinished: number;
  games: number;
  /** A's win rate with a 95% confidence interval. */
  winRate: MeanCI;
  avgHandsPerGame: number;
}

/** Play `pairs` pairs of full games to 500, each pair on the same deal sequence with teams swapped. */
export function duplicateGames(
  a: Strategy, b: Strategy, pairs: number, seed = 1, rules: RulesConfig = DEFAULT_RULES,
): GamesMatchResult {
  let aWins = 0, bWins = 0, unfinished = 0, hands = 0;
  const pairScores: number[] = [];
  for (let i = 0; i < pairs; i++) {
    const dealSeed = deriveSeed(seed, i);
    let pairA = 0;
    for (const aTeam of [0, 1] as const) {
      const players = aTeam === 0 ? seatsFor(a, b) : seatsFor(b, a);
      const g = playGame({ players, rules, dealSeed, playerSeed: deriveSeed(seed, i, 1 + aTeam), firstDealer: i % 4 });
      hands += g.hands.length;
      if (g.winner === null) unfinished++;
      else if (g.winner === aTeam) { aWins++; pairA += 1; }
      else bWins++;
    }
    pairScores.push(pairA / 2);
  }
  return {
    aWins, bWins, unfinished, games: pairs * 2,
    winRate: meanCI(pairScores),
    avgHandsPerGame: hands / (pairs * 2),
  };
}

/** Merge stats from several shards. */
export function mergeStats(parts: SideStats[]): SideStats {
  const out = emptyStats();
  for (const p of parts) {
    out.hands += p.hands; out.contractsWon += p.contractsWon; out.contractsMade += p.contractsMade;
    out.misereBids += p.misereBids; out.misereMade += p.misereMade; out.pointsFor += p.pointsFor;
    for (const [k, [n, m]] of p.byBid) {
      const e = out.byBid.get(k) ?? [0, 0];
      out.byBid.set(k, [e[0] + n, e[1] + m]);
    }
  }
  return out;
}

/**
 * Duplicate hands from realistic mid-game scores. Returns A's average gain in
 * game-win probability per deal (percentage points), summed over both seatings
 * so that A faces each score from both sides.
 */
export function duplicateScoredHands(
  a: Strategy, b: Strategy, deals: number, seed: number, states: [number, number][], table: import("./winprob.ts").WinTable,
  rules: RulesConfig = DEFAULT_RULES, start = 0,
): HandsMatchResult {
  const diffs: number[] = [];
  const sa = emptyStats();
  const sb = emptyStats();
  for (let i = start; i < start + deals; i++) {
    const dealSeed = deriveSeed(seed, i);
    const scores = states[i % states.length];
    const dealer = i % 4;
    let gain = 0;
    for (const aTeam of [0, 1] as const) {
      const players = aTeam === 0 ? seatsFor(a, b) : seatsFor(b, a);
      const r = playHand({
        deal: dealCards(makeRng(dealSeed)), dealer, players, scores: [scores[0], scores[1]], rules,
        rng: makeRng(deriveSeed(seed, i, 1 + aTeam)),
      });
      record(sa, r, aTeam);
      record(sb, r, (1 - aTeam) as 0 | 1);
      const dTeam = teamOf(dealer);
      const before = table.forTeam(aTeam, scores, dTeam);
      let after = before;
      if (r.contract && r.score) {
        const ns: [number, number] = [scores[0] + r.score.points[0], scores[1] + r.score.points[1]];
        const p0 = table.after(ns, teamOf(r.contract.bidder), (1 - dTeam) as 0 | 1);
        after = aTeam === 0 ? p0 : 1 - p0;
      } else {
        after = table.forTeam(aTeam, scores, (1 - dTeam) as 0 | 1); // redeal: the deal moves on
      }
      gain += after - before;
    }
    diffs.push(100 * gain);
  }
  return { diff: meanCI(diffs), diffs, a: sa, b: sb };
}
