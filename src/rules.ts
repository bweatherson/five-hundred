import { Card, Suit, isJoker, suitOf, rankOf, sameColourSuit } from "./cards.ts";

// ---------------------------------------------------------------------------
// Configuration: house rules that vary between tables.
// ---------------------------------------------------------------------------

export interface RulesConfig {
  /** Score needed to win the game. */
  winScore: number;
  /** Falling to this score or below loses the game. */
  loseScore: number;
  /** Misère may be bid at all. */
  allowMisere: boolean;
  /** Misère may only be bid once someone has bid at the 7 level or higher. */
  misereNeedsSeven: boolean;
  /** Open misère: at any time (standard), only once someone has bid 8 or more, or never. */
  openMisere: "anytime" | "afterEight" | "off";
  /** Taking all 10 tricks scores at least this much (if the bid is worth less). */
  slamMinimum: number;
  /** If true, the bidding side also scores 10 per trick when it makes its contract. */
  bidderScoresTricks: boolean;
  /** Points per trick for the defenders (and for bidders, if bidderScoresTricks). */
  pointsPerTrick: number;
}

export const DEFAULT_RULES: RulesConfig = {
  winScore: 500,
  loseScore: -500,
  allowMisere: true,
  misereNeedsSeven: true,
  openMisere: "anytime",
  slamMinimum: 250,
  bidderScoresTricks: false,
  pointsPerTrick: 10,
};

// ---------------------------------------------------------------------------
// Bids
// ---------------------------------------------------------------------------

export type Strain = Suit | "NT";
export const STRAINS: Strain[] = ["S", "C", "D", "H", "NT"];

export type Bid =
  | { kind: "suit"; tricks: number; strain: Strain }
  | { kind: "misere" }
  | { kind: "openMisere" };

/** A player's turn in the auction: a bid, or null for a pass. */
export type BidAction = Bid | null;

const STRAIN_BASE: Record<Strain, number> = { S: 40, C: 60, D: 80, H: 100, NT: 120 };

/** Avondale schedule. */
export function bidValue(bid: Bid): number {
  switch (bid.kind) {
    case "suit":
      return STRAIN_BASE[bid.strain] + (bid.tricks - 6) * 100;
    case "misere":
      return 250;
    case "openMisere":
      return 500;
  }
}

/**
 * Ordering key for the auction. Bids rank by value; open misère (500) ranks
 * just below 10♥ (also 500).
 */
export function bidRank(bid: Bid): number {
  const v = bidValue(bid) * 2;
  return bid.kind === "openMisere" ? v - 1 : v;
}

export function sameBid(a: Bid, b: Bid): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "suit" && b.kind === "suit") return a.tricks === b.tricks && a.strain === b.strain;
  return true;
}

/** Every bid that exists, in ascending order. */
export const ALL_BIDS: Bid[] = (() => {
  const bids: Bid[] = [];
  for (let t = 6; t <= 10; t++) for (const s of STRAINS) bids.push({ kind: "suit", tricks: t, strain: s });
  bids.push({ kind: "misere" }, { kind: "openMisere" });
  return bids.sort((a, b) => bidRank(a) - bidRank(b));
})();

export function bidLabel(bid: BidAction): string {
  if (bid === null) return "pass";
  if (bid.kind === "misere") return "misère";
  if (bid.kind === "openMisere") return "open misère";
  const s = { S: "♠", C: "♣", D: "♦", H: "♥", NT: "NT" }[bid.strain];
  return `${bid.tricks}${s}`;
}

/** One entry in the auction history. */
export interface AuctionEntry {
  seat: number;
  bid: BidAction;
}

/** The bids (other than pass) that are legal now, given the auction so far. */
export function legalBids(auction: AuctionEntry[], rules: RulesConfig): Bid[] {
  let highest: Bid | null = null;
  let reachedSeven = false;
  let reachedEight = false;
  for (const e of auction) {
    if (e.bid === null) continue;
    highest = e.bid;
    if (e.bid.kind === "suit" && e.bid.tricks >= 7) reachedSeven = true;
    if (e.bid.kind === "suit" && e.bid.tricks >= 8) reachedEight = true;
    if (e.bid.kind === "openMisere") reachedSeven = reachedEight = true;
  }
  return ALL_BIDS.filter((b) => {
    if (highest && bidRank(b) <= bidRank(highest)) return false;
    if (b.kind === "misere" && (rules.allowMisere === false || (rules.misereNeedsSeven && !reachedSeven))) return false;
    if (b.kind === "openMisere") {
      const om = rules.openMisere ?? "anytime";
      if (om === "off" || (om === "afterEight" && !reachedEight)) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Contracts, trumps and trick-taking
// ---------------------------------------------------------------------------

export interface Contract {
  bid: Bid;
  bidder: number;
  /** Trump suit, or null for no-trumps (which includes both misères). */
  trump: Suit | null;
  misere: boolean;
  open: boolean;
}

export function makeContract(bid: Bid, bidder: number): Contract {
  if (bid.kind === "suit") {
    return { bid, bidder, trump: bid.strain === "NT" ? null : bid.strain, misere: false, open: false };
  }
  return { bid, bidder, trump: null, misere: true, open: bid.kind === "openMisere" };
}

/** Seats that play cards this hand (the misère bidder's partner sits out). */
export function activeSeats(contract: Contract): number[] {
  const all = [0, 1, 2, 3];
  if (!contract.misere) return all;
  const partner = (contract.bidder + 2) % 4;
  return all.filter((s) => s !== partner);
}

export function isRightBower(card: Card, trump: Suit | null): boolean {
  return trump !== null && card === "J" + trump;
}

export function isLeftBower(card: Card, trump: Suit | null): boolean {
  return trump !== null && card === "J" + sameColourSuit(trump);
}

/**
 * The suit a card belongs to for following purposes. With trumps, the Joker
 * and Left Bower are trumps. In no-trumps the Joker belongs to no suit
 * (returns null) unless it was led, in which case the leader names its suit.
 */
export function effectiveSuit(card: Card, trump: Suit | null): Suit | null {
  if (isJoker(card)) return trump;
  if (isLeftBower(card, trump)) return trump;
  return suitOf(card);
}

export function isTrump(card: Card, trump: Suit | null): boolean {
  if (trump === null) return isJoker(card);
  return effectiveSuit(card, trump) === trump;
}

/**
 * Cards from `hand` that may be played. `ledSuit` is null if this player is
 * leading. When the Joker is led in no-trumps, ledSuit is the named suit.
 */
export function legalPlays(hand: Card[], ledSuit: Suit | null, trump: Suit | null): Card[] {
  if (ledSuit === null) return hand.slice();
  const following = hand.filter((c) => effectiveSuit(c, trump) === ledSuit);
  return following.length > 0 ? following : hand.slice();
}

/** How strong a card is in the current trick (higher wins; 0 cannot win). */
export function cardPower(card: Card, ledSuit: Suit, trump: Suit | null): number {
  if (isJoker(card)) return 100;
  if (trump !== null) {
    if (isRightBower(card, trump)) return 99;
    if (isLeftBower(card, trump)) return 98;
    if (suitOf(card) === trump) return 50 + rankOf(card);
  }
  if (suitOf(card) === ledSuit) return rankOf(card);
  return 0;
}

export interface Play {
  seat: number;
  card: Card;
}

/** Index into `plays` of the winning play. */
export function trickWinnerIndex(plays: Play[], ledSuit: Suit, trump: Suit | null): number {
  let best = 0;
  let bestPower = -1;
  plays.forEach((p, i) => {
    const pw = cardPower(p.card, ledSuit, trump);
    if (pw > bestPower) {
      bestPower = pw;
      best = i;
    }
  });
  return best;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export function teamOf(seat: number): 0 | 1 {
  return (seat % 2) as 0 | 1;
}

export interface HandScore {
  /** Points for team 0 (seats 0 & 2) and team 1 (seats 1 & 3). */
  points: [number, number];
  made: boolean;
}

/** Score a completed hand. `tricks` is tricks won per team. */
export function scoreHand(contract: Contract, tricks: [number, number], rules: RulesConfig): HandScore {
  const bt = teamOf(contract.bidder);
  const dt = 1 - bt;
  const value = bidValue(contract.bid);
  const points: [number, number] = [0, 0];
  let made: boolean;

  if (contract.misere) {
    made = tricks[bt] === 0;
    points[bt] = made ? value : -value;
  } else {
    const needed = (contract.bid as { tricks: number }).tricks;
    made = tricks[bt] >= needed;
    if (made) {
      let v = value;
      if (tricks[bt] === 10 && v < rules.slamMinimum) v = rules.slamMinimum;
      points[bt] = v + (rules.bidderScoresTricks ? tricks[bt] * rules.pointsPerTrick : 0);
    } else {
      points[bt] = -value;
    }
  }
  points[dt] = tricks[dt] * rules.pointsPerTrick;
  return { points, made };
}

/**
 * After a hand, decide whether the game is over. Returns the winning team, or
 * null if play continues. Reaching the win score wins however it is reached;
 * if both teams reach it on the same hand, the bidders win.
 */
export function gameWinner(
  scores: [number, number],
  bidderTeam: 0 | 1,
  rules: RulesConfig,
): 0 | 1 | null {
  const reached = [scores[0] >= rules.winScore, scores[1] >= rules.winScore];
  if (reached[0] && reached[1]) return bidderTeam;
  if (reached[0]) return 0;
  if (reached[1]) return 1;
  if (scores[0] <= rules.loseScore) return 1;
  if (scores[1] <= rules.loseScore) return 0;
  return null;
}
