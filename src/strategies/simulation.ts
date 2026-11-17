// Simulation player ("perfect-information Monte Carlo"). For each card it
// could play, it deals the unseen cards many plausible ways, plays each deal
// out with a fast rollout policy, and picks the card with the best average
// result for its side. Because the result is scored with the real contract,
// it automatically cares about the bid level: e.g. defenders against 8 value
// the third trick enormously.
//
// Bidding and the kitty discard are delegated to a base strategy.
import { Card, Suit, SUITS, isJoker } from "../cards.ts";
import { PlayView, Strategy } from "../player.ts";
import { PlayState, applyPlay, cloneState, isHandOver, stepPlay } from "../game.ts";
import { scoreHand, teamOf } from "../rules.ts";
import { World, sampleWorld } from "./sampling.ts";
import { solveEndgameFast as solveEndgame } from "./endgame-fast.ts";
import { loadWinTable } from "../winprob.ts";
import { InferenceParams, DEFAULT_INFERENCE, auctionConstraints, violation } from "./inference.ts";

export interface SimParams {
  /** Number of sampled deals per decision. */
  worlds: number;
  /** Policy used for every seat during rollouts. */
  rollout: Strategy;
  /** Used for bidding and discarding. */
  base: Strategy;
  /** Use known voids when sampling hands. */
  respectVoids: boolean;
  /** Prefer sampled deals that fit the auction (bids and passes). */
  infer: boolean;
  /** Candidate deals tried per world when inferring (first consistent one wins). */
  tries: number;
  inference: InferenceParams;
  /** Solve the last this-many tricks of each rollout exactly (0 = off). */
  endgame: number;
  /** "points": maximise this hand's point difference. "win": maximise game-win probability. */
  objective?: "points" | "win";
}

/** Play a sampled deal out; returns team 0 points minus team 1 points. */
export function rollout(s: PlayState, players: Strategy[], rng: () => number, endgame: number): number {
  while (!isHandOver(s) && (10 - s.tricks.length > endgame || s.current.length > 0)) stepPlay(s, players, rng, false);
  if (!isHandOver(s)) return solveEndgame(s);
  const p = scoreHand(s.contract, s.teamTricks, s.rules).points;
  return p[0] - p[1];
}

/** Sample one world, preferring deals consistent with the auction. */
export function sampleConsistentWorld(view: PlayView, params: SimParams, constraints = auctionConstraints(view, params.inference)): World {
  let best = sampleWorld(view, view.rng, params.respectVoids);
  if (!params.infer || constraints.length === 0) return best;
  let bestV = violation(view, best.hands, constraints);
  for (let t = 1; t < params.tries && bestV > 0; t++) {
    const w = sampleWorld(view, view.rng, params.respectVoids);
    const v = violation(view, w.hands, constraints);
    if (v < bestV) { best = w; bestV = v; }
  }
  return best;
}

interface Candidate {
  card: Card;
  jokerSuit?: Suit;
}

export function simulationStrategy(params: SimParams, name = "sim"): Strategy {
  let pendingJokerSuit: Suit | undefined;
  return {
    name,
    bid: (v) => params.base.bid(v),
    discard: (v) => params.base.discard(v),
    jokerSuit: () => pendingJokerSuit ?? "S",
    play(view) {
      const choice = choose(view, params);
      pendingJokerSuit = choice.jokerSuit;
      return choice.card;
    },
  };
}

export function candidatesFor(view: PlayView): Candidate[] {
  const out: Candidate[] = [];
  for (const card of view.legal) {
    if (view.ledSuit === null && isJoker(card) && view.contract.trump === null) {
      for (const s of SUITS) out.push({ card, jokerSuit: s });
    } else out.push({ card });
  }
  return out;
}

/** Average (our points − their points) for each candidate. */
export function evaluate(view: PlayView, params: SimParams): { cand: Candidate; value: number }[] {
  const cands = candidatesFor(view);
  const totals = cands.map(() => 0);
  const myTeam = teamOf(view.seat);
  const rollers = [params.rollout, params.rollout, params.rollout, params.rollout];
  const teamTricks: [number, number] = [0, 0];
  for (const t of view.tricks) teamTricks[teamOf(t.winner)]++;

  const constraints = params.infer ? auctionConstraints(view, params.inference) : [];
  const table = params.objective === "win" ? loadWinTable() : null;
  for (let w = 0; w < params.worlds; w++) {
    const world = sampleConsistentWorld(view, params, constraints);
    const state: PlayState = {
      contract: view.contract, auction: view.auction, dealer: view.dealer, scores: view.scores, rules: view.rules,
      hands: world.hands, discarded: world.discarded, tricks: view.tricks.slice(), current: view.current.slice(),
      ledSuit: view.ledSuit, leader: view.current.length ? view.current[0].seat : view.seat,
      teamTricks: [teamTricks[0], teamTricks[1]],
    };
    cands.forEach((c, i) => {
      const s = cloneState(state);
      applyPlay(s, c.card, c.jokerSuit);
      if (params.objective === "win") {
        // Play the deal out, then value the resulting game score.
        rollout(s, rollers, view.rng, 0);
        const pts = scoreHand(s.contract, s.teamTricks, s.rules).points;
        const ns: [number, number] = [view.scores[0] + pts[0], view.scores[1] + pts[1]];
        const p0 = table!.after(ns, teamOf(s.contract.bidder), (1 - teamOf(view.dealer)) as 0 | 1);
        totals[i] += myTeam === 0 ? p0 : 1 - p0;
      } else {
        const d = rollout(s, rollers, view.rng, params.endgame);
        totals[i] += myTeam === 0 ? d : -d;
      }
    });
  }
  return cands.map((cand, i) => ({ cand, value: totals[i] / params.worlds }));
}

function choose(view: PlayView, params: SimParams): Candidate {
  if (view.legal.length === 1 && !(view.ledSuit === null && isJoker(view.legal[0]) && view.contract.trump === null)) {
    return { card: view.legal[0] };
  }
  const scored = evaluate(view, params);
  return scored.reduce((a, b) => (b.value > a.value ? b : a)).cand;
}
