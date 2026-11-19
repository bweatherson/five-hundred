// A rule-of-thumb player with tunable parameters, so that variants can be
// tested against each other (e.g. bold vs cautious bidding).
import { Card, Suit, SUITS, isJoker, rankOf, suitOf } from "../cards.ts";
import { Bid, BidAction, Strain, STRAINS, bidValue, teamOf, effectiveSuit, isLeftBower, isRightBower, isTrump } from "../rules.ts";
import { BidView, DiscardView, PlayView, Strategy } from "../player.ts";
import { knownVoids } from "./sampling.ts";
import { fittedTricks } from "./features.ts";

export type EstimateModel = "classic" | "fit";
import { loadWinTable } from "../winprob.ts";
import {
  cardPower, cheapest, currentWinner, dearest, isBoss, partnerOf, sameTeam, sideSuitCards, suitCounts, unseenCards,
} from "./util.ts";

export interface HeuristicParams {
  /** Tricks we expect partner to contribute. */
  partnerTricks: number;
  /** Extra tricks expected from the kitty. */
  kittyTricks: number;
  /** Added to the trick estimate before rounding down to a bid level. */
  aggression: number;
  /** Extra tricks credited to a strain partner has bid. */
  partnerSupport: number;
  /** Max "dangerous" cards (before discarding) to bid misère; -1 disables misère. */
  misereDanger: number;
  /** Max dangerous cards, judged strictly, to bid open misère; -1 disables. */
  openMisereDanger: number;
  /** Bid straight to our maximum instead of the cheapest legal bid. */
  jump: boolean;
  /** With jump: stop at the cheapest bid that would win the game. */
  jumpToWin: boolean;
  /** Jump: open (first bid of the auction) at the level below our maximum, when the maximum is at least this (0 = off). */
  jumpOpen: number;
  /** Don't push: pass instead of overcalling an opponent's bid when our estimate clears the bid by less than this (0 = off). */
  noPush: number;
  /** noPush: 1 = only when partner has passed (0 = always). */
  noPushMode: number;

  // --- Reacting to the auction -------------------------------------------
  /** Multiplies every auction-signal adjustment below (0 = ignore the auction). */
  signalWeight: number;
  /** Extra tricks in every strain once partner has bid anything (they have high cards). */
  partnerBidBoost: number;
  /** Tricks removed from partner's expected contribution once they have passed. */
  partnerPassPenalty: number;
  /** Tricks removed in a strain an opponent has bid (they hold those trumps). */
  opponentStrainPenalty: number;

  // --- Misère judgement ---------------------------------------------------
  /**
   * "simple": the original rank-threshold rule.
   * "gap": a card is dangerous if more lower cards of its suit are out than
   * we hold below it (plus misereSlack). Voids cancel dangers, because they
   * let us throw dangerous cards away.
   */
  misereModel: "simple" | "gap";
  misereSlack: number;
  /** Dangers cancelled by each void suit (gap model). */
  misereVoidCredit: number;

  // --- Signal bids ----------------------------------------------------------
  /**
   * Make a cheap 6-level bid we would not otherwise make, to show partner a
   * suit, when our own hand's trick estimate in it is at least this. -1 = off.
   */
  signalBid: number;
  /** Which suits may be shown this way: only the cheap black suits, or any. */
  signalStrains: "SC" | "all";

  // --- Kitty discard --------------------------------------------------------
  /**
   * "simple": low cards from short suits, never aces (the original rule).
   * "void": like simple but with a stronger pull toward emptying short suits
   *   (discardVoidWeight), so a short King can go before a long suit's 8.
   * "eval": try every 3-card discard, keep the one whose remaining hand has
   *   the highest trick estimate.
   */
  discardMode: "simple" | "void" | "eval";
  discardVoidWeight: number;
  discardKeepAces: boolean;

  // --- Card play switches ---------------------------------------------------
  /** Second to play, with no certain winner: play low rather than try to win. */
  secondHandLow: boolean;
  /** ...but when void in the led suit, trump in second seat anyway. */
  secondHandRuff: boolean;
  /** ...and apply second-hand-low only for this side. */
  secondHandLowSide: "both" | "bidders" | "defenders";
  /** Defenders hold side winners (rather than cashing) only in no-trumps. */
  defenderHoldInNT: boolean;
  /** Defenders only cash side winners from this trick on (0 = always). */
  defenderCashFromTrick: number;
  /** Defenders with nothing to cash lead a low trump (to cut down the bidder's ruffs). */
  defenderLeadTrumps: boolean;
  /** Holding trumps, lead a singleton side card to set up a ruff. */
  leadSingleton: boolean;

  // --- Game score -----------------------------------------------------------
  /** Pass when partner holds the bid and making it wins the game. */
  stopAtWin: boolean;
  /** Extra tricks of aggression when the opponents hold a bid that wins them the game. */
  desperation: number;
  /** Further extra when our pass would end the auction in that situation. */
  desperationLast: number;
  /** When our score is at least nearWinScore, adjust aggression by nearWinAdjust. */
  nearWinScore: number;
  nearWinAdjust: number;
  /** When the opponents' score is at least behindScore and we are behind, adjust by behindAdjust. */
  behindScore: number;
  behindAdjust: number;
  /** Extra aggression = winProbAggression × (0.5 − our current game-win probability). */
  winProbAggression: number;
  /** Defenders cash side-suit winners as soon as they get the lead. */
  defenderLeadsBoss: boolean;
  /** Bidders cash side-suit winners as soon as they get the lead (after trumps). */
  bidderLeadsBoss: boolean;
  /** Bidders leading trumps: "standard" (boss trumps, or low from 3+), "never", "always". */
  drawTrumps: "standard" | "never" | "always";
  /** Lead toward partner's known voids and away from opponents' (trump contracts). */
  voidAwareLeads: boolean;
  /** When we cannot follow and are not winning, throw from our shortest side suit. */
  throwFromShort: boolean;
  /**
   * A side card is not treated as boss if an opponent who may still hold trumps
   * has shown out of its suit (trump contracts).
   */
  /** Defenders lead partner's bid suit: 0 off, 1 after cashing winners, 2 before. */
  leadPartnerSuit: number;
  /** When unable to follow, keep winners and guards: 0 off, 1 defenders, 2 both sides. */
  guardDiscards: number;
  /** Defenders' lead-choice penalty for suits partner has discarded from. */
  avoidPartnerDiscards: number;
  /** Ruff with the lowest trump rather than the cheapest boss trump: 0 off, 1 second seat, 2 second and third seat. */
  ruffLow: number;
  /** Partner winning (not last, card not boss): 0 = overtake only a card below Q with a boss;
   *  1 = overtake any non-boss card with a boss; 2 = as 1, else with our highest card that beats it. */
  overtakePartner: number;
  /** Partner is winning a side-suit trick that we're out of: 0 = may overtake with a boss trump, 1 = never ruff it, 2 = ruff only with our lowest winning trump. */
  partnerRuff: number;
  /** Cashing side winners: lead the highest boss of the suit (A before K), so partner can read it. */
  cashTop: boolean;
  /** Defenders second to a bidder's side-suit lead, holding the boss: duck when 1 = holding boss + one other
   *  and the defence still needs 2+ tricks; 2 = also when the bidder's partner has shown out. */
  secondHandDuck: number;
  /** Bidder without the boss trump (or Joker): don't lead low trumps when this many or fewer are out. */
  noBossTrumpLead: number;
  /** Guarded discards: cost reduction for a suit an opponent has shown out of. */
  discardOppVoid: number;
  /** Guarded discards: cost reduction per card held in the suit (prefer the long suit). */
  discardLong: number;
  /** Defender holding the Joker and other trumps, not last to play on an opponent's trump lead: keep the Joker, play the lowest other trump (1 = bidder's lead, 2 = either opponent's, 3 = as 2 but win a top trump with the Joker). */
  jokerDuck: number;
  /** Defender in control: holding the Joker and at least this many trumps (counting ones already played) against a contract of at most defControlMax tricks, play like the bidder: win the opponent's trump lead with the Joker, and lead boss trumps to draw theirs (0 = off). */
  defControl: number;
  defControlMax: number;
  /** Defender on lead from trick N on, needing 2+ tricks, holding 1-2 trumps (no Joker) with trumps out: lead the top trump (0 = off). */
  lateTrumpLead: number;
  /** Defender on lead from this trick on, with 1-2 trumps out: lead a trump (0 = off). */
  fewTrumpsLead: number;
  /** fewTrumpsLead: 1 = before cashing side winners, 2 = after; +4 = lead the highest trump. */
  fewTrumpsMode: number;
  /** Misère defence, bit flags: 1 = when you must beat the bidder's card, or partner already has, play your highest; 2 = discard your highest; 4 = lead the bottom card of a suit the bidder may hold; 8 = with the bidder last, strip a suit where you hold the bottom by leading its top card (tricks 1-6); 16 = count the open misère hand as the bidder's cards, and don't lead a suit the bidder is known to be out of if you can avoid it. */
  misereDef: number;
  /** Misère bidder, bit flags: 1 = tricks 1-3, lead low from the shortest suit; 2 = from trick 4, lead the highest card with 2+ unseen cards below it; 4 = discard the top card of the shortest suit; 32 = use misereLeadBelow only when already out of a suit; 8 = with 4, skip suits where no unseen card is lower than our top card (those cards can never win, so there's nothing to gain by throwing them). */
  misereBid: number;
  /** Misère bidder's lead (with misereBid & 1): only lead from suits whose lowest card has at most this many unseen cards below it; if there are none, lead the card with the fewest (−1 = off). */
  misereLeadBelow: number;
  /** Bidder drawing trumps without the boss trump: lead the highest trump instead of the lowest. */
  drawHigh: boolean;
  /** Bidder's partner: when the bidder leads a trump that isn't boss, play the Joker on it. */
  partnerJoker: boolean;
  /** Near 500: raise our bid to the level that stops the opponents winning on defensive tricks. */
  raiseToStop: number; // 0 off, 1 always, 2 only when our bid will be final
  /** Extra aggression applied to bids at the 7 level and above, and further at 8 and above. */
  aggression7: number;
  aggression8: number;
  /** Trick estimate: hand-picked values ("classic") or fitted to playouts ("fit"). */
  estimateModel: EstimateModel;
  /** Kitty discards judged by this estimate (defaults to estimateModel). */
  discardModel: EstimateModel | "same";
  /** Bidders stop leading trumps once they hold this many (0 = never hold back). */
  bidderKeepTrumps: number;
  /** "all": the hold-back applies to every trump lead; "nonboss": boss trumps / Joker are still led. */
  bidderKeepMode: "all" | "nonboss";
  /** ...only while at least this many trumps are unseen (else draw the last ones). */
  bidderKeepMinOut: number;
  ruffAwareBoss: number; // bitmask: 1 = when leading, 2 = when following
  /** Defenders: lead-choice penalty for a suit the bidder has shown out of (and may ruff). */
  avoidBidderVoid: number;
  /** Defenders: lead-choice penalty for a suit the bidder's partner has shown out of. */
  avoidPartnerVoid: number;
  /** Bidding side: stop leading trumps once both opponents are known (or inferred) to be out of them. */
  drawStopVoid: boolean;
  /** Stop drawing trumps when at most this many are out and partner bid the trump suit (and hasn't shown out): they're probably partner's (0 = off). */
  drawPartnerHolds: number;
  /**
   * Infer an opponent is out of trumps when they followed a trump lead with a trump that didn't
   * win the trick and at most `drawInferOut - 1` unseen trumps outrank it (0 = off). Defenders
   * play their lowest card when they can't win, so their remaining trumps must outrank it.
   */
  drawInferOut: number;
  /** Bid no-trumps only holding at least this many aces (the Joker counts if ntJokerAce). */
  ntMinAces: number;
  ntJokerAce: boolean;
}

export const DEFAULT_HEURISTIC: HeuristicParams = {
  partnerTricks: 1.5,
  kittyTricks: 0.5,
  aggression: 0,
  partnerSupport: 1,
  misereDanger: 2,
  openMisereDanger: 0,
  jump: false,
  jumpToWin: false,
  jumpOpen: 0,
  noPush: 0,
  noPushMode: 0,
  signalWeight: 1,
  partnerBidBoost: 0,
  partnerPassPenalty: 0,
  opponentStrainPenalty: 0,
  misereModel: "simple",
  misereSlack: 0,
  misereVoidCredit: 1,
  signalBid: -1,
  signalStrains: "SC",
  discardMode: "simple",
  discardVoidWeight: 3,
  discardKeepAces: true,
  secondHandLow: true,
  secondHandRuff: false,
  secondHandLowSide: "both",
  defenderHoldInNT: false,
  defenderLeadTrumps: false,
  defenderCashFromTrick: 0,
  leadSingleton: false,
  stopAtWin: false,
  desperation: 0,
  desperationLast: 0,
  nearWinScore: 9999,
  nearWinAdjust: 0,
  behindScore: 9999,
  behindAdjust: 0,
  winProbAggression: 0,
  defenderLeadsBoss: true,
  bidderLeadsBoss: true,
  drawTrumps: "standard",
  voidAwareLeads: false,
  throwFromShort: false,
  raiseToStop: 0,
  leadPartnerSuit: 0,
  guardDiscards: 0,
  avoidPartnerDiscards: 0,
  ruffLow: 0,
  overtakePartner: 0,
  partnerRuff: 0,
  cashTop: false,
  secondHandDuck: 0,
  noBossTrumpLead: 0,
  discardOppVoid: 0,
  discardLong: 0,
  jokerDuck: 0,
  defControl: 0,
  defControlMax: 6,
  lateTrumpLead: 0,
  fewTrumpsLead: 0,
  fewTrumpsMode: 1,
  misereDef: 0,
  misereBid: 0,
  misereLeadBelow: -1,
  drawHigh: false,
  partnerJoker: false,
  aggression7: 0,
  aggression8: 0,
  estimateModel: "classic",
  discardModel: "same",
  bidderKeepTrumps: 0,
  bidderKeepMode: "all",
  bidderKeepMinOut: 0,
  ruffAwareBoss: 0,
  avoidBidderVoid: 0,
  avoidPartnerVoid: 0,
  drawStopVoid: false,
  drawPartnerHolds: 0,
  drawInferOut: 0,
  ntMinAces: 0,
  ntJokerAce: false,
};

/** Settings for the gap-based misère model and fuller auction signals. */
export const SIGNAL_DEFAULTS: Partial<HeuristicParams> = {
  partnerBidBoost: 0.5,
  partnerPassPenalty: 0.5,
  opponentStrainPenalty: 1,
};

// ---------------------------------------------------------------------------
// Hand evaluation
// ---------------------------------------------------------------------------

/** Rough number of tricks this hand takes on its own with the given strain. */
export function estimateTricks(hand: Card[], strain: Strain, model: EstimateModel = "classic"): number {
  // The fitted model predicts the side's total; subtract the default partner (1.5) + kitty (0.5)
  // allowance so it stays on the same scale as the hand-only classic estimate.
  if (model === "fit") return fittedTricks(hand, strain) - 2;
  return strain === "NT" ? estimateNT(hand) : estimateSuit(hand, strain);
}

function estimateSuit(hand: Card[], trump: Suit): number {
  const trumps = hand.filter((c) => isTrump(c, trump)).sort((a, b) => cardPower(b, trump, trump) - cardPower(a, trump, trump));
  // The full trump ladder, top down: Joker, right, left, A, K, Q, 10, ...
  const ladder = ["JK", "J" + trump, "J" + ({ S: "C", C: "S", D: "H", H: "D" } as const)[trump]];
  for (const r of ["A", "K", "Q", "T", "9", "8", "7", "6", "5", "4"]) ladder.push(r + trump);
  let tricks = 0;
  trumps.forEach((c, i) => {
    const missingAbove = ladder.slice(0, ladder.indexOf(c)).filter((x) => !hand.includes(x)).length;
    if (missingAbove <= i) tricks += 1;
    else if (missingAbove === i + 1) tricks += 0.5;
    else if (i >= 3) tricks += 0.5; // long trumps win by length
    else tricks += 0.1;
  });
  for (const s of SUITS) {
    if (s === trump) continue;
    const cards = sideSuitCards(hand, s, trump);
    const has = (r: string) => cards.includes(r + s);
    if (has("A")) tricks += cards.length >= 6 ? 0.6 : 0.9;
    if (has("K")) tricks += has("A") ? 0.6 : cards.length >= 2 ? 0.35 : 0.1;
    if (trumps.length >= 4) {
      if (cards.length === 0) tricks += 0.6;
      else if (cards.length === 1 && !has("A")) tricks += 0.3;
    }
  }
  return tricks;
}

function estimateNT(hand: Card[]): number {
  let tricks = hand.includes("JK") ? 1 : 0;
  let unstopped = 0;
  for (const s of SUITS) {
    const cards = sideSuitCards(hand, s, null);
    const has = (r: string) => cards.includes(r + s);
    let t = 0;
    if (has("A")) t += 1;
    if (has("K")) t += has("A") ? 0.8 : cards.length >= 2 ? 0.45 : 0.1;
    if (has("Q")) t += has("A") && has("K") ? 0.7 : 0.15;
    if (has("A") && cards.length > 4) t += (cards.length - 4) * 0.6;
    if (!has("A") && !(has("K") && cards.length >= 2)) unstopped++;
    tricks += t;
  }
  return tricks - unstopped * 0.7;
}

/**
 * Cards likely to win a trick in misère (no trumps). A suit's cards are safe
 * if they are low enough given how many lower cards we hold in that suit.
 */
export function misereDangers(hand: Card[], strict = false): Card[] {
  const out: Card[] = [];
  if (hand.includes("JK")) out.push("JK");
  for (const s of SUITS) {
    const cards = hand.filter((c) => !isJoker(c) && suitOf(c) === s).sort((a, b) => rankOf(a) - rankOf(b));
    cards.forEach((c, i) => {
      const limit = strict ? 6 + 1.5 * i : 7 + 2 * i;
      if (rankOf(c) > limit) out.push(c);
    });
  }
  return out;
}

const SUIT_LOW: Record<Suit, number> = { S: 5, C: 5, D: 4, H: 4 };

/**
 * For each card, how many lower cards of its suit are held by others, minus
 * how many lower cards of the suit we hold ourselves. Positive "excess" means
 * an opponent can lead low and we may be forced to win. Joker: Infinity.
 */
export function misereExcess(hand: Card[]): Map<Card, number> {
  const out = new Map<Card, number>();
  if (hand.includes("JK")) out.set("JK", Infinity);
  for (const s of SUITS) {
    const cards = hand.filter((c) => !isJoker(c) && suitOf(c) === s).sort((a, b) => rankOf(a) - rankOf(b));
    cards.forEach((c, i) => {
      const lowerOut = rankOf(c) - SUIT_LOW[s] - i; // lower cards of this suit not in our hand
      out.set(c, lowerOut - i);
    });
  }
  return out;
}

/** Gap model: dangerous cards, net of voids. */
export function misereGapRisk(hand: Card[], slack: number, voidCredit: number): number {
  const dangers = [...misereExcess(hand).values()].filter((e) => e > slack).length;
  const voids = SUITS.filter((s) => !hand.some((c) => !isJoker(c) && suitOf(c) === s)).length;
  return dangers - voids * voidCredit;
}

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

export function heuristicStrategy(params: Partial<HeuristicParams> = {}, name = "heuristic"): Strategy {
  const p = { ...DEFAULT_HEURISTIC, ...params };
  return {
    name,
    bid: (v) => chooseBid(v, p),
    discard: (v) => (v.contract.misere && p.misereModel === "gap" ? misereGapDiscard(v.hand) : chooseDiscard(v, p)),
    play: (v) => (v.contract.misere ? playMisere(v, p) : playNormal(v, p)),
  };
}

function chooseBid(v: BidView, p: HeuristicParams): BidAction {
  if (v.legal.length === 0) return null;
  const partner = partnerOf(v.seat);
  const strainsBidBy = (pred: (seat: number) => boolean) => new Set(
    v.auction.filter((e) => pred(e.seat) && e.bid?.kind === "suit").map((e) => (e.bid as { strain: Strain }).strain),
  );
  const partnerStrains = strainsBidBy((s) => s === partner);
  const opponentStrains = strainsBidBy((s) => !sameTeam(s, v.seat));
  const partnerBid = v.auction.some((e) => e.seat === partner && e.bid !== null);
  const partnerPassed = v.auction.some((e) => e.seat === partner && e.bid === null);

  // Game-score situation
  const myTeam = v.seat % 2;
  let high: { seat: number; bid: Bid } | null = null;
  for (const e of v.auction) if (e.bid) high = { seat: e.seat, bid: e.bid };
  let scoreBoost = 0;
  const ours = v.scores[myTeam], theirs = v.scores[1 - myTeam];
  if (ours >= p.nearWinScore) scoreBoost += p.nearWinAdjust;
  if (theirs >= p.behindScore && theirs > ours) scoreBoost += p.behindAdjust;
  if (p.winProbAggression !== 0) {
    const wp = loadWinTable().forTeam(myTeam as 0 | 1, v.scores, teamOf(v.dealer));
    scoreBoost += p.winProbAggression * (0.5 - wp);
  }
  if (high) {
    const highTeam = high.seat % 2;
    const wins = v.scores[highTeam] + bidValue(high.bid) >= v.rules.winScore;
    if (wins && highTeam === myTeam && high.seat !== v.seat && p.stopAtWin) return null;
    if (wins && highTeam !== myTeam) {
      scoreBoost += p.desperation;
      const passed = new Set(v.auction.filter((e) => e.bid === null).map((e) => e.seat));
      const othersLeft = [0, 1, 2, 3].filter((x) => x !== v.seat && x !== high!.seat && !passed.has(x));
      if (othersLeft.length === 0) scoreBoost += p.desperationLast;
    }
  }

  // Maximum level we are willing to go to in each strain.
  const maxLevel = {} as Record<Strain, number>;
  const estimate = {} as Record<Strain, number>;
  for (const s of STRAINS) {
    const signals = (partnerStrains.has(s) ? p.partnerSupport : 0)
      + (partnerBid ? p.partnerBidBoost : 0)
      - (partnerPassed ? p.partnerPassPenalty : 0)
      - (opponentStrains.has(s) ? p.opponentStrainPenalty : 0);
    const est = estimateTricks(v.hand, s, p.estimateModel) + p.partnerTricks + p.kittyTricks + p.aggression + p.signalWeight * signals + scoreBoost;
    // Highest level whose (level-adjusted) estimate reaches it.
    let lvl = Math.min(10, Math.floor(est));
    if (p.aggression7 !== 0 || p.aggression8 !== 0) {
      const adj = (L: number) => (L >= 7 ? p.aggression7 : 0) + (L >= 8 ? p.aggression8 : 0);
      lvl = 5;
      for (let L = 6; L <= 10; L++) if (est + adj(L) >= L) lvl = L;
    }
    if (s === "NT" && p.ntMinAces > 0) {
      const aces = v.hand.filter((c) => rankOf(c) === 14 && !isJoker(c)).length + (p.ntJokerAce && v.hand.includes("JK") ? 1 : 0);
      if (aces < p.ntMinAces) lvl = 5;
    }
    maxLevel[s] = lvl;
    estimate[s] = est;
  }

  const candidates: Bid[] = v.legal.filter((b) => b.kind === "suit" && b.tricks <= maxLevel[b.strain]);

  // Misère options
  const gap = p.misereModel === "gap";
  const misereRisk = gap ? misereGapRisk(v.hand, p.misereSlack, p.misereVoidCredit) : misereDangers(v.hand).length;
  const openRisk = gap ? misereGapRisk(v.hand, 0, p.misereVoidCredit / 2) : misereDangers(v.hand, true).length;
  if (p.misereDanger >= 0 && misereRisk <= p.misereDanger) {
    const m = v.legal.find((b) => b.kind === "misere");
    if (m) candidates.push(m);
  }
  if (p.openMisereDanger >= 0 && openRisk <= p.openMisereDanger) {
    const m = v.legal.find((b) => b.kind === "openMisere");
    if (m) candidates.push(m);
  }
  if (candidates.length === 0) return signalBid(v, p, partnerBid);

  // Pick the strain whose maximum is worth most; then bid cheaply (or jump) in it.
  const ceiling = (b: Bid) =>
    b.kind === "suit" ? bidValue({ kind: "suit", tricks: maxLevel[b.strain], strain: b.strain }) : bidValue(b);
  const bestCeiling = Math.max(...candidates.map(ceiling));
  const inBest = candidates.filter((b) => ceiling(b) === bestCeiling);
  inBest.sort((a, b) => bidValue(a) - bidValue(b));
  let chosen = p.jump ? inBest[inBest.length - 1] : inBest[0];
  if (p.jump && p.jumpToWin) {
    // No need to jump past the cheapest bid that wins the game.
    const wins = inBest.find((b) => ours + bidValue(b) >= v.rules.winScore);
    if (wins) chosen = wins;
  }
  if (p.jumpOpen > 0 && !high && chosen.kind === "suit" && maxLevel[chosen.strain] >= p.jumpOpen) {
    const lvl = maxLevel[chosen.strain] - 1;
    const j = inBest.find((b) => b.kind === "suit" && b.tricks === lvl);
    if (j) chosen = j;
  }
  if (p.noPush > 0 && high && !sameTeam(high.seat, v.seat) && chosen.kind === "suit"
      && (!(p.noPushMode & 1) || partnerPassed)
      && estimate[chosen.strain] - chosen.tricks < p.noPush) {
    return null;
  }
  const passedSeats = new Set(v.auction.filter((e) => e.bid === null).map((e) => e.seat));
  const finalBid = [0, 1, 2, 3].every((x) => x === v.seat || passedSeats.has(x));
  if (p.raiseToStop && (p.raiseToStop === 1 || finalBid) && chosen.kind === "suit" && ours + bidValue(chosen) < v.rules.winScore) {
    // The opponents need n tricks to reach 500, so we need 11 − n. Any lower bid
    // loses the game in the same cases and scores less when it makes.
    const n = Math.ceil((v.rules.winScore - theirs) / 10);
    const need = 11 - n;
    if (n >= 1 && need > chosen.tricks && need <= 10) {
      const up = v.legal.find((b) => b.kind === "suit" && b.strain === chosen.strain && b.tricks === need);
      if (up) return up;
    }
  }
  return chosen;
}

/** A cheap 6-level bid to show partner a suit, if enabled and the hand qualifies. */
function signalBid(v: BidView, p: HeuristicParams, partnerBid: boolean): BidAction {
  if (p.signalBid < 0 || partnerBid) return null;
  if (v.auction.some((e) => e.seat === v.seat)) return null; // only on our first turn
  const strains: Strain[] = p.signalStrains === "SC" ? ["S", "C"] : ["S", "C", "D", "H"];
  let best: Bid | null = null;
  let bestEst = p.signalBid;
  for (const s of strains) {
    const b = v.legal.find((x) => x.kind === "suit" && x.strain === s && x.tricks === 6);
    if (!b) continue;
    const est = estimateTricks(v.hand, s, p.estimateModel);
    if (est >= bestEst) { best = b; bestEst = est; }
  }
  return best;
}

/** Misère discard: throw the cards with the most excess; break ties toward short suits (voids). */
export function misereGapDiscard(thirteen: Card[]): Card[] {
  let hand = thirteen.slice();
  const out: Card[] = [];
  for (let i = 0; i < 3; i++) {
    const excess = misereExcess(hand);
    const len = (c: Card) => (isJoker(c) ? 0 : hand.filter((x) => !isJoker(x) && suitOf(x) === suitOf(c)).length);
    const score = (c: Card) => (excess.get(c) ?? 0) * 100 - len(c) * 10 + rankOf(c);
    const c = hand.reduce((a, b) => (score(b) > score(a) ? b : a));
    out.push(c);
    hand = hand.filter((x) => x !== c);
  }
  return out;
}

function chooseDiscard(v: DiscardView, p: HeuristicParams): Card[] {
  const { contract } = v;
  if (!contract.misere && p.discardMode === "eval") return evalDiscard(v.hand, contract.trump, p.discardKeepAces,
    p.discardModel === "same" ? p.estimateModel : p.discardModel);
  let hand = v.hand.slice();
  const out: Card[] = [];
  if (contract.misere) {
    // Throw the most dangerous cards: Joker first, then by how far over the safe line.
    for (let i = 0; i < 3; i++) {
      const dangers = misereDangers(hand);
      const c = dangers.length > 0 ? dangers.reduce((a, b) => (rankOf(b) > rankOf(a) ? b : a)) : dearest(hand, null);
      out.push(c);
      hand = hand.filter((x) => x !== c);
    }
    return out;
  }
  const trump = contract.trump;
  for (let i = 0; i < 3; i++) {
    const counts = suitCounts(hand, trump);
    const side = hand.filter((c) => !isTrump(c, trump) && !isJoker(c));
    const nonAce = p.discardKeepAces ? side.filter((c) => rankOf(c) !== 14) : side;
    const pool = nonAce.length > 0 ? nonAce : side.length > 0 ? side : hand.filter((c) => !isJoker(c));
    // Prefer low cards in short suits (to make voids).
    const w = p.discardMode === "void" ? p.discardVoidWeight : 3;
    const score = (c: Card) => rankOf(c) + counts[suitOf(c)] * w;
    const c = pool.reduce((a, b) => (score(b) < score(a) ? b : a));
    out.push(c);
    hand = hand.filter((x) => x !== c);
  }
  return out;
}

/** Try every 3-card discard; keep the one leaving the best trick estimate. */
export function evalDiscard(thirteen: Card[], trump: Suit | null, keepAces: boolean, model: EstimateModel = "classic"): Card[] {
  const strain: Strain = trump ?? "NT";
  let pool = thirteen.filter((c) => !isJoker(c) && !isTrump(c, trump) && !(keepAces && rankOf(c) === 14));
  if (pool.length < 3) pool = thirteen.filter((c) => !isJoker(c));
  let best: Card[] = pool.slice(0, 3);
  let bestScore = -Infinity;
  for (let i = 0; i < pool.length; i++)
    for (let j = i + 1; j < pool.length; j++)
      for (let k = j + 1; k < pool.length; k++) {
        const d = [pool[i], pool[j], pool[k]];
        const rest = thirteen.filter((c) => !d.includes(c));
        // Tie-break: throw lower cards.
        const score = estimateTricks(rest, strain, model) * 100 - d.reduce((t, c) => t + rankOf(c), 0) * 0.01;
        if (score > bestScore) { bestScore = score; best = d; }
      }
  return best;
}

/**
 * True if `seat` followed a trump lead with a losing trump (they couldn't or didn't try to win)
 * while fewer than `tol` unseen trumps outrank it. A player who can't win plays their lowest
 * card, so whatever trumps they have left must be above it.
 */
export function inferredOutOfTrumps(v: PlayView, seat: number, unseen: Card[], tol: number): boolean {
  const trump = v.contract.trump;
  if (tol <= 0 || trump === null) return false;
  for (const t of v.tricks) {
    if (t.ledSuit !== trump) continue;
    let best = -1;
    for (const pl of t.plays) {
      const pw = cardPower(pl.card, trump, trump);
      if (pl.seat === seat && best >= 0 && pw < best && isTrump(pl.card, trump)) {
        const above = unseen.filter((c) => isTrump(c, trump) && cardPower(c, trump, trump) > pw).length;
        if (above < tol) return true;
      }
      if (pw > best) best = pw;
    }
  }
  return false;
}

function playNormal(v: PlayView, p: HeuristicParams): Card {
  const trump = v.contract.trump;
  const unseen = unseenCards(v);
  const legal = v.legal;
  const weAreBidders = sameTeam(v.seat, v.contract.bidder);
  const inControl = (() => {
    if (p.defControl <= 0 || weAreBidders || trump === null || v.contract.bid.kind !== "suit") return false;
    if (v.contract.bid.tricks > p.defControlMax) return false;
    const playedJoker = v.tricks.some((t) => t.plays.some((x) => x.seat === v.seat && x.card === "JK"));
    if (!v.hand.includes("JK") && !playedJoker) return false;
    const held = v.hand.filter((c) => isTrump(c, trump)).length;
    const spent = v.tricks.reduce((n, t) => n + t.plays.filter((x) => x.seat === v.seat && isTrump(x.card, trump)).length, 0);
    return held + spent >= p.defControl;
  })();

  // Opponents (of this player) who have shown out of a suit and may still hold trumps.
  const voids = knownVoids(v);
  const trumpsUnseen = trump !== null && unseen.some((c) => isTrump(c, trump));
  const mayRuff = (seat: number, su: Suit) =>
    trump !== null && trumpsUnseen && v.activeSeats.includes(seat) && voids[seat].has(su) && !voids[seat].has(trump);
  const opps = v.activeSeats.filter((x) => !sameTeam(x, v.seat));
  /** Boss, and (if ruffAwareBoss) not exposed to a ruff by any of `later`. */
  const ruffBit = v.ledSuit === null ? 1 : 2;
  const safeBoss = (c: Card, later: number[]) => {
    if (!isBoss(c, v, unseen)) return false;
    if (!(p.ruffAwareBoss & ruffBit) || trump === null || isJoker(c) || isTrump(c, trump)) return true;
    const su = effectiveSuit(c, trump) as Suit;
    return !later.some((o) => mayRuff(o, su));
  };
  const played = new Set(v.current.map((x) => x.seat));
  const laterOpps = opps.filter((o) => !played.has(o));

  // Leading
  if (v.ledSuit === null) {
    const nonJoker = legal.filter((c) => !isJoker(c));
    if (nonJoker.length === 0) return legal[0];
    if (trump !== null && weAreBidders && p.drawTrumps !== "never") {
      const myTrumps = nonJoker.filter((c) => isTrump(c, trump));
      const partner = partnerOf(v.seat);
      const partnerHolds = p.drawPartnerHolds > 0 && !voids[partner].has(trump)
        && v.auction.some((e) => e.seat === partner && e.bid?.kind === "suit" && e.bid.strain === trump)
        && unseen.filter((c) => isTrump(c, trump)).length <= p.drawPartnerHolds;
      const enemyTrumpsOut = unseen.some((c) => isTrump(c, trump)) && !partnerHolds
        && (!p.drawStopVoid || opps.some((o) => !voids[o].has(trump) && !inferredOutOfTrumps(v, o, unseen, p.drawInferOut)));
      // Hold back the last `bidderKeepTrumps` trumps (all leads, or only non-boss ones).
      const total = myTrumps.length + (legal.includes("JK") ? 1 : 0);
      const outCount = unseen.filter((c) => isTrump(c, trump)).length;
      const canSpend = total > p.bidderKeepTrumps || outCount < p.bidderKeepMinOut;
      const bossOk = canSpend || p.bidderKeepMode === "nonboss";
      if (myTrumps.length > 0 && enemyTrumpsOut) {
        const boss = myTrumps.filter((c) => isBoss(c, v, unseen));
        if (boss.length > 0 && bossOk) return boss[0];
        if (legal.includes("JK") && bossOk) return "JK";
        const noBossHold = boss.length === 0 && !legal.includes("JK") && outCount <= p.noBossTrumpLead
          && nonJoker.some((c) => !isTrump(c, trump));
        if ((myTrumps.length >= 3 || p.drawTrumps === "always") && canSpend && !noBossHold) return p.drawHigh ? dearest(myTrumps, trump) : cheapest(myTrumps, trump);
      }
    }
    const cashBoss = weAreBidders
      ? p.bidderLeadsBoss
      : p.defenderLeadsBoss && !(p.defenderHoldInNT && trump === null) && v.tricks.length >= p.defenderCashFromTrick;
    const avoided = (c: Card) => {
      if (weAreBidders || trump === null) return false;
      const su = effectiveSuit(c, trump) as Suit;
      return (p.avoidBidderVoid > 0 && mayRuff(v.contract.bidder, su))
        || (p.avoidPartnerVoid > 0 && mayRuff(partnerOf(v.contract.bidder), su));
    };
    const sideBoss = nonJoker.filter((c) => !isTrump(c, trump) && safeBoss(c, opps) && !avoided(c));
    // Defenders: lead the suit partner bid in the auction (most recent first).
    const partnerSuitLead = (): Card | null => {
      if (weAreBidders || !p.leadPartnerSuit) return null;
      const partner = partnerOf(v.seat);
      const bids = v.auction.filter((e) => e.seat === partner && e.bid?.kind === "suit").map((e) => (e.bid as { strain: Strain }).strain);
      for (const st of bids.reverse()) {
        if (st === "NT" || st === trump) continue;
        if (mayRuff(v.contract.bidder, st) || mayRuff(partnerOf(v.contract.bidder), st)) continue;
        const mine = nonJoker.filter((c) => effectiveSuit(c, trump) === st);
        if (mine.length === 0) continue;
        const boss = mine.filter((c) => safeBoss(c, opps));
        return boss.length > 0 ? boss[0] : cheapest(mine, trump);
      }
      return null;
    };
    const fewTrumps = (): Card | null => {
      if (weAreBidders || trump === null || p.fewTrumpsLead <= 0 || v.tricks.length + 1 < p.fewTrumpsLead) return null;
      const mine = nonJoker.filter((c) => isTrump(c, trump));
      const out = unseen.filter((c) => isTrump(c, trump)).length;
      if (mine.length === 0 || out < 1 || out > 2) return null;
      return p.fewTrumpsMode & 4 ? dearest(mine, trump) : cheapest(mine, trump);
    };
    if (inControl && unseen.some((c) => isTrump(c, trump!))) {
      const mine = legal.filter((c) => isTrump(c, trump!));
      const boss = mine.filter((c) => isBoss(c, v, unseen));
      if (boss.length > 0) return boss[0];
    }
    if (p.fewTrumpsMode & 1) { const c = fewTrumps(); if (c) return c; }
    if (p.leadPartnerSuit === 2) { const c = partnerSuitLead(); if (c) return c; }
    if (cashBoss && sideBoss.length > 0) {
      if (!p.cashTop || trump === null) return sideBoss[0];
      const su = effectiveSuit(sideBoss[0], trump);
      return dearest(sideBoss.filter((c) => effectiveSuit(c, trump) === su), trump);
    }
    if (p.fewTrumpsMode & 2) { const c = fewTrumps(); if (c) return c; }
    if (p.leadPartnerSuit === 1) { const c = partnerSuitLead(); if (c) return c; }
    let side = nonJoker.filter((c) => !isTrump(c, trump));
    if (!cashBoss && side.some((c) => !sideBoss.includes(c))) side = side.filter((c) => !sideBoss.includes(c));
    if (side.length === 0) return cheapest(nonJoker, trump);
    const myTrumps = nonJoker.filter((c) => isTrump(c, trump));
    if (trump !== null && myTrumps.length > 0) {
      if (!weAreBidders && p.lateTrumpLead > 0 && v.tricks.length + 1 >= p.lateTrumpLead && myTrumps.length <= 2
          && !legal.includes("JK") && unseen.some((c) => isTrump(c, trump))) {
        const bidTricks = (v.contract.bid as { tricks: number }).tricks;
        const defWon = v.tricks.filter((t) => !sameTeam(t.winner, v.contract.bidder)).length;
        if (11 - bidTricks - defWon >= 2) return dearest(myTrumps, trump);
      }
      if (!weAreBidders && p.defenderLeadTrumps && unseen.some((c) => isTrump(c, trump))) return cheapest(myTrumps, trump);
      if (p.leadSingleton) {
        const cnt = suitCounts(side, trump);
        const single = side.find((c) => cnt[suitOf(c)] === 1 && !sideBoss.includes(c));
        if (single) return single;
      }
    }
    // Lowest card of our longest side suit (optionally steering by known voids).
    const counts = suitCounts(side, trump);
    let score = (su: Suit) => counts[su];
    if (p.voidAwareLeads && trump !== null) {
      const partner = partnerOf(v.seat);
      score = (su: Suit) => counts[su]
        + (voids[partner].has(su) && !voids[partner].has(trump) && v.activeSeats.includes(partner) ? 4 : 0)
        - (opps.some((o) => mayRuff(o, su)) ? 4 : 0);
    }
    if (!weAreBidders && (p.avoidBidderVoid > 0 || p.avoidPartnerVoid > 0)) {
      const bidder = v.contract.bidder;
      const base = score;
      score = (su: Suit) => base(su)
        - (mayRuff(bidder, su) ? p.avoidBidderVoid : 0)
        - (mayRuff(partnerOf(bidder), su) ? p.avoidPartnerVoid : 0);
    }
    if (!weAreBidders && p.avoidPartnerDiscards !== 0) {
      // Suits partner threw away (when unable to follow) are suits partner doesn't value.
      const partner = partnerOf(v.seat);
      const thrown = new Set<Suit>();
      for (const t of [...v.tricks, { plays: v.current, ledSuit: v.ledSuit }]) {
        for (const pl of t.plays) {
          if (pl.seat !== partner || t.ledSuit === null || isJoker(pl.card)) continue;
          const su = effectiveSuit(pl.card, trump) as Suit;
          if (su !== t.ledSuit && su !== trump) thrown.add(su);
        }
      }
      const base2 = score;
      score = (su: Suit) => base2(su) - (thrown.has(su) ? p.avoidPartnerDiscards : 0);
    }
    const choices = SUITS.filter((su) => counts[su] > 0);
    const pick = choices.reduce((a, b) => (score(b) > score(a) ? b : a));
    return cheapest(side.filter((c) => suitOf(c) === pick || (effectiveSuit(c, trump) === pick)), trump);
  }

  // Following
  const win = currentWinner(v)!;
  const last = v.current.length === v.activeSeats.length - 1;
  const partnerWinning = sameTeam(win.seat, v.seat);
  const beats = legal.filter((c) => cardPower(c, v.ledSuit!, trump) > win.power);

  const throwaway = () => {
    const canFollow = legal.some((c) => effectiveSuit(c, trump) === v.ledSuit);
    if (p.guardDiscards && !canFollow && (p.guardDiscards === 2 || !weAreBidders)) {
      // Keep winners and the guards of honours; throw from suits with nothing to protect.
      const side = legal.filter((c) => !isJoker(c) && !isTrump(c, trump));
      if (side.length > 0) {
        const cost = (c: Card) => {
          const su = effectiveSuit(c, trump) as Suit;
          const suit = side.filter((x) => effectiveSuit(x, trump) === su);
          let k = rankOf(c);
          if (isBoss(c, v, unseen)) k += 20;
          if (p.discardOppVoid && opps.some((o) => voids[o].has(su))) k -= p.discardOppVoid;
          k -= p.discardLong * suit.length;
          const top = suit.reduce((a, b) => (rankOf(b) > rankOf(a) ? b : a));
          if (!isBoss(top, v, unseen) && rankOf(top) >= 12) {
            const higher = unseen.filter((x) => effectiveSuit(x, trump) === su && cardPower(x, su, trump) > cardPower(top, su, trump)).length;
            if (suit.length <= higher + 1) k += 10; // throwing from here would unguard the honour
          }
          return k;
        };
        return side.reduce((a, b) => (cost(b) < cost(a) ? b : a));
      }
    }
    if (!p.throwFromShort || canFollow) return cheapest(legal, trump);
    const side = legal.filter((c) => !isJoker(c) && !isTrump(c, trump) && !isBoss(c, v, unseen));
    if (side.length === 0) return cheapest(legal, trump);
    const counts = suitCounts(side, trump);
    const shortest = SUITS.filter((su) => counts[su] > 0).reduce((a, b) => (counts[b] < counts[a] ? b : a));
    return cheapest(side.filter((c) => suitOf(c) === shortest), trump);
  };

  if (partnerWinning) {
    if (p.partnerJoker && trump !== null && v.ledSuit === trump && !last && legal.includes("JK")
        && v.current[0].seat === v.contract.bidder && win.seat === v.contract.bidder && !isBoss(win.card, v, unseen)) return "JK";
    if (last || safeBoss(win.card, laterOpps) || beats.length === 0) return throwaway();
    const ruffing = trump !== null && v.ledSuit !== trump && !legal.some((c) => effectiveSuit(c, trump) === v.ledSuit);
    if (ruffing && p.partnerRuff === 1) return throwaway();
    if (ruffing && p.partnerRuff === 2) {
      const lowTrump = beats.filter((c) => !isJoker(c));
      return lowTrump.length > 0 ? cheapest(lowTrump, trump) : throwaway();
    }
    const bossBeats = beats.filter((c) => safeBoss(c, laterOpps) && !isJoker(c));
    if ((win.power < 12 || p.overtakePartner > 0) && bossBeats.length > 0) return cheapest(bossBeats, trump);
    if (p.overtakePartner === 2) {
      const sideBeats = beats.filter((c) => !isJoker(c) && !(trump !== null && isTrump(c, trump)));
      if (sideBeats.length > 0) return dearest(sideBeats, trump);
    }
    return throwaway();
  }
  if (beats.length === 0) return throwaway();
  if (last) return cheapest(beats, trump);
  const following = legal.some((c) => effectiveSuit(c, trump) === v.ledSuit);
  const seatPos = v.current.length; // 1 = second, 2 = third
  if (p.ruffLow > 0 && !following && trump !== null && seatPos <= p.ruffLow) return cheapest(beats, trump);
  if (p.secondHandDuck > 0 && !weAreBidders && seatPos === 1 && following && trump !== null
      && v.current[0].seat === v.contract.bidder && v.ledSuit !== trump) {
    const mine = legal; // all of the led suit
    const bidTricks = (v.contract.bid as { tricks: number }).tricks;
    const defWon = v.tricks.filter((t) => !sameTeam(t.winner, v.contract.bidder)).length;
    const defNeed = 11 - bidTricks - defWon;
    const bpVoid = voids[partnerOf(v.contract.bidder)].has(v.ledSuit!) && !voids[partnerOf(v.contract.bidder)].has(trump);
    if (defNeed >= 2 && mine.some((c) => isBoss(c, v, unseen)) && (mine.length === 2 || (p.secondHandDuck === 2 && bpVoid))) {
      return cheapest(legal, trump);
    }
  }
  // jokerDuck 3: as 2, but take a top trump (nothing unseen but the Joker beats it) with the Joker.
  const topLed = (() => {
    if (p.jokerDuck !== 3 || trump === null || v.ledSuit !== trump || v.current.length === 0) return false;
    const w = currentWinner(v)!;
    return !unseen.some((c) => !isJoker(c) && isTrump(c, trump) && cardPower(c, trump, trump) > w.power) && !sameTeam(w.seat, v.seat);
  })();
  if (p.jokerDuck > 0 && !weAreBidders && trump !== null && v.ledSuit === trump && legal.includes("JK") && !inControl && !topLed
      && (p.jokerDuck >= 2 || v.current[0].seat === v.contract.bidder)) {
    const others = legal.filter((c) => !isJoker(c));
    if (others.length > 0) return cheapest(others, trump);
  }
  const bossBeats = beats.filter((c) => safeBoss(c, laterOpps));
  if (bossBeats.length > 0) return cheapest(bossBeats, trump);
  const second = v.current.length === 1;
  const lowSide = p.secondHandLowSide === "both" || (p.secondHandLowSide === "bidders") === weAreBidders;
  if (p.secondHandLow && lowSide && second && v.activeSeats.length === 4) {
    const canFollow = legal.some((c) => effectiveSuit(c, trump) === v.ledSuit);
    if (!canFollow && p.secondHandRuff) return cheapest(beats, trump);
    return cheapest(legal, trump); // second hand low
  }
  return cheapest(beats, trump);
}

function playMisere(v: PlayView, p: HeuristicParams): Card {
  const bidder = v.contract.bidder;
  const legal = v.legal;
  const rankLow = (c: Card) => (isJoker(c) ? 99 : rankOf(c));
  const lowest = (cs: Card[]) => cs.reduce((a, b) => (rankLow(b) < rankLow(a) ? b : a));
  const highest = (cs: Card[]) => cs.reduce((a, b) => (rankLow(b) > rankLow(a) ? b : a));

  if (v.seat === bidder) {
    const mine = legal.filter((c) => !isJoker(c));
    const shortest = () => {
      const n = (su: Suit) => mine.filter((c) => suitOf(c) === su).length;
      return SUITS.filter((su) => n(su) > 0).reduce((a, b) => (n(b) < n(a) ? b : a));
    };
    if (v.ledSuit === null) {
      if (mine.length > 0 && p.misereBid & 1 && v.tricks.length < 3) {
        const hasVoid = SUITS.some((su) => !v.hand.some((c) => !isJoker(c) && suitOf(c) === su));
        if (p.misereLeadBelow >= 0 && (!(p.misereBid & 32) || hasVoid)) {
          const unseen = unseenCards(v);
          const below = (c: Card) => unseen.filter((x) => !isJoker(x) && suitOf(x) === suitOf(c) && rankOf(x) < rankOf(c)).length;
          const n = (su: Suit) => mine.filter((c) => suitOf(c) === su).length;
          const low = (su: Suit) => lowest(mine.filter((c) => suitOf(c) === su));
          const suits = SUITS.filter((su) => n(su) > 0 && below(low(su)) <= p.misereLeadBelow);
          if (suits.length > 0) return low(suits.reduce((a, b) => (n(b) < n(a) ? b : a)));
          return SUITS.filter((su) => n(su) > 0).map(low).reduce((a, b) => (below(b) < below(a) ? b : a));
        }
        const su = shortest();
        return lowest(mine.filter((c) => suitOf(c) === su));
      }
      if (mine.length > 0 && p.misereBid & 2 && v.tricks.length >= 3) {
        const unseen = unseenCards(v);
        const below = (c: Card) => unseen.filter((x) => !isJoker(x) && suitOf(x) === suitOf(c) && rankOf(x) < rankOf(c)).length;
        const safe = mine.filter((c) => below(c) >= 2);
        if (safe.length > 0) return highest(safe);
      }
      return lowest(legal);
    }
    const voidNow = !legal.some((c) => !isJoker(c) && suitOf(c) === v.ledSuit);
    if (voidNow && mine.length > 0 && p.misereBid & 4) {
      if (p.misereBid & 8) {
        const unseen = unseenCards(v);
        const top = (su: Suit) => highest(mine.filter((c) => suitOf(c) === su));
        const live = (su: Suit) => unseen.some((x) => !isJoker(x) && suitOf(x) === su && rankOf(x) < rankOf(top(su)));
        const n = (su: Suit) => mine.filter((c) => suitOf(c) === su).length;
        const suits = SUITS.filter((su) => n(su) > 0 && live(su));
        if (suits.length === 0) return highest(legal);
        return top(suits.reduce((a, b) => (n(b) < n(a) ? b : a)));
      }
      const su = shortest();
      return highest(mine.filter((c) => suitOf(c) === su));
    }
    const win = currentWinner(v)!;
    const under = legal.filter((c) => cardPower(c, v.ledSuit!, null) < win.power && !isJoker(c));
    if (under.length > 0) return highest(under);
    return highest(legal);
  }

  const plain = legal.filter((c) => !isJoker(c));
  const unseen = unseenCards(v);
  const isBottom = (c: Card) => !isJoker(c) && !unseen.some((x) => !isJoker(x) && suitOf(x) === suitOf(c) && rankOf(x) < rankOf(c));
  const voids = knownVoids(v);
  const pool = v.exposed ? (p.misereDef & 16 ? v.exposed : v.exposed.filter((c) => unseen.includes(c))) : unseen;
  const live = (su: Suit) => !voids[bidder].has(su) && pool.some((c) => !isJoker(c) && suitOf(c) === su);

  // Defender: try to force the bidder to win a trick.
  if (v.ledSuit === null) {
    if (v.exposed) {
      // Lead a suit where the bidder's lowest card is above our lowest.
      for (const c of legal.slice().sort((a, b) => rankLow(a) - rankLow(b))) {
        if (isJoker(c)) continue;
        const theirs = v.exposed.filter((x) => !isJoker(x) && suitOf(x) === suitOf(c));
        if (theirs.length > 0 && Math.min(...theirs.map(rankOf)) > rankOf(c)) return c;
      }
    }
    if (plain.length > 0) {
      if (p.misereDef & 8 && (v.seat + 1) % 4 !== bidder && v.tricks.length < 6) {
        for (const su of SUITS) {
          const cs = plain.filter((c) => suitOf(c) === su);
          if (cs.length >= 2 && live(su) && cs.some(isBottom)) return highest(cs);
        }
      }
      if (p.misereDef & 4) {
        const b = plain.filter((c) => live(suitOf(c)) && isBottom(c));
        if (b.length > 0) return lowest(b);
      }
    }
    if (p.misereDef & 16) {
      const into = plain.filter((c) => live(suitOf(c)));
      if (into.length > 0) return lowest(into);
    }
    return lowest(plain.length ? plain : legal);
  }
  const following = legal.some((c) => !isJoker(c) && suitOf(c) === v.ledSuit);
  const bidderPlayed = v.current.some((x) => x.seat === bidder);
  if (!following && p.misereDef & 2 && plain.length > 0) {
    // Void: throw the highest card unless the bidder is winning (then any card keeps the bidder winning; still the highest).
    return highest(plain);
  }
  if (!bidderPlayed) return lowest(legal);
  const win = currentWinner(v)!;
  if (win.seat === bidder) {
    const under = legal.filter((c) => cardPower(c, v.ledSuit!, null) < win.power && !isJoker(c));
    if (p.misereDef & 1 && following && v.current.length === 1 && under.some(isBottom) && plain.length > 0) return highest(plain);
    if (under.length > 0) return highest(under);
    if (p.misereDef & 1 && plain.length > 0) return highest(plain); // we must win it anyway: keep the low cards
    return lowest(legal);
  }
  if (p.misereDef & 1 && following && plain.length > 0) return highest(plain); // partner has it beaten: shed high cards
  return lowest(legal);
}

export { isLeftBower, isRightBower };
