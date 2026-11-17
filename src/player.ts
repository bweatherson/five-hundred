import { Card, Suit } from "./cards.ts";
import { AuctionEntry, Bid, BidAction, Contract, Play, RulesConfig } from "./rules.ts";
import { Rng } from "./rng.ts";

// What a player is allowed to know. Strategies only ever receive these views,
// never the other players' hands, so they cannot cheat by accident.

export interface BaseView {
  seat: number;
  dealer: number;
  rules: RulesConfig;
  /** Game scores before this hand: [team 0 (seats 0,2), team 1 (seats 1,3)]. */
  scores: [number, number];
  /** This player's current hand. */
  hand: Card[];
  auction: AuctionEntry[];
  /** Randomness for strategies that want it (seeded, so runs are reproducible). */
  rng: Rng;
}

export interface BidView extends BaseView {
  /** Legal bids other than pass (pass, i.e. null, is always legal). */
  legal: Bid[];
}

export interface DiscardView extends BaseView {
  contract: Contract;
  /** The three kitty cards (already included in `hand`, which has 13 cards). */
  kitty: Card[];
}

export interface CompletedTrick {
  leader: number;
  plays: Play[];
  ledSuit: Suit;
  winner: number;
}

export interface PlayView extends BaseView {
  contract: Contract;
  /** Seats playing this hand, in no particular order. */
  activeSeats: number[];
  tricks: CompletedTrick[];
  /** Cards played so far to the current trick, in order. */
  current: Play[];
  /** The suit to follow, or null if this player is leading. */
  ledSuit: Suit | null;
  legal: Card[];
  /** The open misère bidder's remaining cards, visible to the other players. */
  exposed: Card[] | null;
  /** The cards this player discarded, if they were the bidder. */
  discarded: Card[] | null;
}

export interface Strategy {
  name: string;
  /** Return a bid from view.legal, or null to pass. */
  bid(view: BidView): BidAction;
  /** Return exactly three cards from view.hand to discard. */
  discard(view: DiscardView): Card[];
  /** Return a card from view.legal. */
  play(view: PlayView): Card;
  /** When leading the Joker in no-trumps, name the suit others must follow. */
  jokerSuit?(view: PlayView): Suit;
}

export type { Bid, BidAction, Contract, Play };
