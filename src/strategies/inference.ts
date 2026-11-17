// Auction inference: judge how well a sampled deal fits the bidding.
//
// Each bid says "my hand is worth at least this much", and each pass says
// "my hand was not worth the cheapest bid available". We measure both with the
// same trick estimate the heuristic bidder uses, so this models opponents who
// bid roughly like `tuned`. A deal's "violation" is how far (in tricks) the
// hands fall outside what the auction implies; 0 means fully consistent.
import { Card } from "../cards.ts";
import { STRAINS, Strain, legalBids } from "../rules.ts";
import { PlayView } from "../player.ts";
import { EstimateModel, estimateTricks, misereGapRisk } from "./heuristic.ts";

export interface InferenceParams {
  /** Tricks a bidder counts on beyond their own hand (partner + kitty + aggression). */
  assumedExtra: number;
  /** Leeway, in tricks, before a deal counts as inconsistent. */
  tolerance: number;
  /** Which trick estimate the opponents are assumed to bid by. */
  model?: EstimateModel;
}

export const DEFAULT_INFERENCE: InferenceParams = { assumedExtra: 2.75, tolerance: 1 };
/** For opponents bidding like tuned4/tuned5: fitted estimate, partner + kitty − 0.5 aggression = 1.5. */
export const FIT_INFERENCE: InferenceParams = { assumedExtra: 1.5, tolerance: 1, model: "fit" };

/** A seat's full hand this deal: what it holds now plus what it has played. */
export function fullHand(view: PlayView, seat: number, current: Card[]): Card[] {
  const played: Card[] = [];
  for (const t of view.tricks) for (const p of t.plays) if (p.seat === seat) played.push(p.card);
  for (const p of view.current) if (p.seat === seat) played.push(p.card);
  return [...current, ...played];
}

interface Constraint {
  seat: number;
  check: (hand: Card[]) => number; // violation in tricks
}

/** Build the auction constraints once per decision; then score each sampled deal. */
export function auctionConstraints(view: PlayView, params: InferenceParams = DEFAULT_INFERENCE): Constraint[] {
  const out: Constraint[] = [];
  const { contract, rules } = view;
  const extra = params.assumedExtra;
  const tol = params.tolerance;
  const model = params.model ?? "classic";

  view.auction.forEach((e, i) => {
    if (e.seat === view.seat) return; // we know our own hand
    if (e.bid === null) {
      if (e.seat === contract.bidder) return;
      // Passed: no strain was worth its cheapest legal level.
      const legal = legalBids(view.auction.slice(0, i), rules);
      const cheapest = new Map<Strain, number>();
      for (const b of legal) if (b.kind === "suit" && !cheapest.has(b.strain)) cheapest.set(b.strain, b.tricks);
      out.push({
        seat: e.seat,
        check: (hand) => {
          let worst = 0;
          for (const s of STRAINS) {
            const lvl = cheapest.get(s);
            if (lvl === undefined) continue;
            worst = Math.max(worst, estimateTricks(hand, s, model) + extra - lvl - tol);
          }
          return Math.max(0, worst);
        },
      });
    } else if (e.bid.kind === "suit") {
      const { tricks, strain } = e.bid;
      out.push({ seat: e.seat, check: (hand) => Math.max(0, tricks - extra - tol - estimateTricks(hand, strain, model)) });
    } else if (e.bid.kind === "misere" && e.seat === contract.bidder && !contract.open) {
      out.push({ seat: e.seat, check: (hand) => Math.max(0, misereGapRisk(hand, 1, 1) - 1 - tol) });
    }
  });
  return out;
}

export function violation(view: PlayView, hands: Card[][], constraints: Constraint[]): number {
  const full = new Map<number, Card[]>();
  let total = 0;
  for (const c of constraints) {
    if (!full.has(c.seat)) full.set(c.seat, fullHand(view, c.seat, hands[c.seat]));
    total += c.check(full.get(c.seat)!);
  }
  return total;
}
