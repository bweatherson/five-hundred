// A step-by-step version of the engine's hand loop (src/game.ts), so a person can
// take one seat. Every rule comes from the shared engine; this file only sequences
// the turns and records what the screen needs to show.
import { Card, Suit, SUITS, isJoker } from "../../../src/cards.ts";
import { Rng, makeRng } from "../../../src/rng.ts";
import {
  AuctionEntry, Bid, BidAction, Contract, DEFAULT_RULES, HandScore, RulesConfig,
  gameWinner, legalBids, legalPlays, makeContract, sameBid, scoreHand, teamOf,
} from "../../../src/rules.ts";
import { CompletedTrick } from "../../../src/player.ts";
import { PlayState, applyPlay, dealCards, defaultJokerSuit, seatToPlay, viewFor } from "../../../src/game.ts";
import { Strategy } from "../../../src/player.ts";
import { makeStrategy } from "../../../src/registry.ts";
import { Play } from "../../../src/rules.ts";

/** The seat a person sits in when playing alone against the computer. */
export const HUMAN = 0;
/** Names for the other seats, as seen from the seat looking at the table. */
export const RELATIVE_NAMES = ["You", "West", "Partner", "East"];
/** A face-down card in a hand sent to another player's screen. */
export const HIDDEN = "??";

/** One decision a person made, next to what the computer would have done in their place. */
export interface ReviewItem {
  seat: number;
  kind: "bid" | "discard" | "play";
  /** For plays: the trick number (1-10) and the cards already on that trick. */
  trick?: number;
  before?: Play[];
  /** Cards in hand when the decision was made (for bids and plays). */
  hand?: Card[];
  actual: BidAction | Card[] | Card;
  suggested: BidAction | Card[] | Card;
  same: boolean;
}

export type Phase = "auction" | "discard" | "play" | "trickEnd" | "handEnd" | "redeal" | "gameEnd";

export interface HandSummary {
  contract: Contract;
  tricks: [number, number];
  score: HandScore;
  scoresAfter: [number, number];
  winner: 0 | 1 | null;
}

export class Table {
  rules: RulesConfig = DEFAULT_RULES;
  ai: Strategy;
  rng: Rng;
  scores: [number, number] = [0, 0];
  dealer: number;
  handNo = 0;

  phase: Phase = "auction";
  hands: Card[][] = [[], [], [], []];
  kitty: Card[] = [];
  auction: AuctionEntry[] = [];
  passed = [false, false, false, false];
  high: { seat: number; bid: Bid } | null = null;
  /** Seat due to bid. */
  bidTurn = 0;

  contract: Contract | null = null;
  discarded: Card[] = [];
  play: PlayState | null = null;
  /** The trick just completed, kept on the table until the screen clears it. */
  lastTrick: CompletedTrick | null = null;
  /** Suit named by whoever led the Joker in no-trumps, for display. */
  jokerNamed: Suit | null = null;
  summary: HandSummary | null = null;
  gameWinner: 0 | 1 | null = null;

  /** Which seats people sit in; the computer plays the rest. */
  humans = [true, false, false, false];
  /** Names of the people at the table (unused for computer seats). */
  names = ["", "", "", ""];
  /** People who have finished looking at the hand summary. */
  ready = [false, false, false, false];
  /** Each decision people made this hand, with the computer's choice beside it. */
  review: ReviewItem[] = [];
  /** The finished trick is being swept off the table (for the animation). */
  collecting = false;
  gameNo = 1;
  private adviceRng: Rng;

  constructor(aiSpec = "tuned14", seed = Date.now(), rules: RulesConfig = DEFAULT_RULES) {
    this.rules = rules;
    this.ai = makeStrategy(aiSpec);
    this.rng = makeRng(seed >>> 0);
    this.adviceRng = makeRng((seed ^ 0x5bd1e995) >>> 0);
    this.dealer = Math.floor(this.rng() * 4);
    this.deal();
  }

  // --- Dealing and the auction ----------------------------------------------

  deal() {
    const d = dealCards(makeRng(Math.floor(this.rng() * 2 ** 31)));
    this.hands = d.hands;
    this.kitty = d.kitty;
    this.auction = [];
    this.passed = [false, false, false, false];
    this.high = null;
    this.contract = null;
    this.discarded = [];
    this.play = null;
    this.lastTrick = null;
    this.jokerNamed = null;
    this.summary = null;
    this.review = [];
    this.ready = [false, false, false, false];
    this.collecting = false;
    this.bidTurn = (this.dealer + 1) % 4;
    this.phase = "auction";
    this.handNo++;
  }

  legalBids(): Bid[] {
    return legalBids(this.auction, this.rules);
  }

  /** The latest auction action of each seat (undefined if it hasn't acted). */
  lastBids(): (BidAction | undefined)[] {
    const out: (BidAction | undefined)[] = [undefined, undefined, undefined, undefined];
    for (const e of this.auction) out[e.seat] = e.bid;
    return out;
  }

  bid(seat: number, bid: BidAction) {
    if (this.phase !== "auction" || seat !== this.bidTurn) throw new Error("Not this seat's turn to bid");
    const legal = this.legalBids();
    if (bid !== null && !legal.some((b) => sameBid(b, bid))) throw new Error("Illegal bid");
    if (this.reviewing(seat) && legal.length > 0) {
      const suggested = this.ai.bid({ ...this.baseView(seat), hand: this.hands[seat].slice(), legal });
      const same = bid === null || suggested === null ? bid === suggested : sameBid(bid, suggested);
      this.review.push({ seat, kind: "bid", hand: this.hands[seat].slice(), actual: bid, suggested, same });
    }
    this.auction.push({ seat, bid });
    if (bid === null) this.passed[seat] = true;
    else this.high = { seat, bid };
    this.advanceAuction();
  }

  private advanceAuction() {
    if (this.passed.every((p) => p)) { this.phase = "redeal"; return; }
    let seat = this.bidTurn;
    for (let i = 0; i < 4; i++) {
      seat = (seat + 1) % 4;
      if (this.passed[seat]) continue;
      if (this.high && this.high.seat === seat) { this.startContract(); return; }
      this.bidTurn = seat;
      // No legal bid left: an automatic pass.
      if (this.legalBids().length === 0) { this.bid(seat, null); }
      return;
    }
  }

  /** After a redeal, the deal passes to the left. */
  redeal() {
    this.dealer = (this.dealer + 1) % 4;
    this.deal();
  }

  // --- The kitty ----------------------------------------------------------------

  private startContract() {
    const { seat, bid } = this.high!;
    this.contract = makeContract(bid, seat);
    this.hands[seat] = [...this.hands[seat], ...this.kitty];
    this.phase = "discard";
  }

  discard(cards: Card[]) {
    const bidder = this.contract!.bidder;
    if (cards.length !== 3 || new Set(cards).size !== 3 || !cards.every((c) => this.hands[bidder].includes(c))) {
      throw new Error("Discard exactly three of your cards");
    }
    if (this.reviewing(bidder)) {
      const suggested = this.ai.discard({
        ...this.baseView(bidder), hand: this.hands[bidder].slice(), contract: this.contract!, kitty: this.kitty.slice(),
      });
      const same = suggested.length === 3 && suggested.every((c) => cards.includes(c));
      this.review.push({ seat: bidder, kind: "discard", hand: this.hands[bidder].slice(), actual: cards.slice(), suggested, same });
    }
    this.discarded = cards.slice();
    this.hands[bidder] = this.hands[bidder].filter((c) => !cards.includes(c));
    this.play = {
      contract: this.contract!, auction: this.auction, dealer: this.dealer, scores: [this.scores[0], this.scores[1]],
      rules: this.rules, hands: this.hands, discarded: this.discarded,
      tricks: [], current: [], ledSuit: null, leader: bidder, teamTricks: [0, 0],
    };
    this.phase = "play";
  }

  // --- Card play ----------------------------------------------------------------

  toPlay(): number {
    return seatToPlay(this.play!);
  }

  legalPlays(seat: number): Card[] {
    const s = this.play!;
    return legalPlays(s.hands[seat], s.ledSuit, s.contract.trump);
  }

  /** Does leading this card need a suit named (the Joker in no-trumps or misère)? */
  needsJokerSuit(card: Card): boolean {
    return isJoker(card) && this.play!.ledSuit === null && this.play!.contract.trump === null;
  }

  playCard(seat: number, card: Card, jokerSuit?: Suit) {
    const s = this.play!;
    if (this.phase !== "play" || seat !== this.toPlay()) throw new Error("Not this seat's turn");
    if (!this.legalPlays(seat).includes(card)) throw new Error("Illegal card");
    if (this.reviewing(seat) && this.legalPlays(seat).length > 1) {
      const suggested = this.ai.play(viewFor(s, seat, this.adviceRng));
      this.review.push({
        seat, kind: "play", trick: s.tricks.length + 1, before: s.current.slice(), hand: s.hands[seat].slice(),
        actual: card, suggested, same: suggested === card,
      });
    }
    if (s.current.length === 0) this.jokerNamed = null;
    if (this.needsJokerSuit(card)) this.jokerNamed = jokerSuit ?? defaultJokerSuit(s.hands[seat]);
    const before = s.tricks.length;
    applyPlay(s, card, this.jokerNamed ?? undefined);
    this.hands = s.hands;
    if (s.tricks.length > before) {
      this.lastTrick = s.tricks[s.tricks.length - 1];
      this.phase = "trickEnd";
    }
  }

  /** Clear the finished trick from the table, and score the hand if it was the last. */
  collectTrick() {
    if (this.phase !== "trickEnd") return;
    this.lastTrick = null;
    this.jokerNamed = null;
    if (this.play!.tricks.length === 10) this.finishHand();
    else this.phase = "play";
  }

  private finishHand() {
    const s = this.play!;
    const score = scoreHand(s.contract, s.teamTricks, this.rules);
    this.scores = [this.scores[0] + score.points[0], this.scores[1] + score.points[1]];
    const winner = gameWinner(this.scores, teamOf(s.contract.bidder), this.rules);
    this.summary = { contract: s.contract, tricks: [s.teamTricks[0], s.teamTricks[1]], score, scoresAfter: [this.scores[0], this.scores[1]], winner };
    this.gameWinner = winner;
    this.phase = "handEnd";
  }

  nextHand() {
    if (this.gameWinner !== null) { this.phase = "gameEnd"; return; }
    this.dealer = (this.dealer + 1) % 4;
    this.deal();
  }

  /** Start a fresh game at the same table. */
  newGame() {
    this.scores = [0, 0];
    this.gameWinner = null;
    this.gameNo++;
    this.dealer = (this.dealer + 1) % 4;
    this.deal();
  }

  /** A person has read the hand summary; once everyone has, play moves on. */
  markReady(seat: number) {
    if (this.phase !== "handEnd" && this.phase !== "gameEnd") return;
    this.ready[seat] = true;
    if (this.humans.every((h, i) => !h || this.ready[i])) {
      if (this.gameWinner !== null) this.newGame();
      else this.nextHand();
    }
  }

  /** Seats still looking at the summary. */
  waitingFor(): number[] {
    return [0, 1, 2, 3].filter((i) => this.humans[i] && !this.ready[i]);
  }

  // --- Whose move, and the computer players -------------------------------------

  /** The seat that must act now, or null when the screen is waiting (trick shown, hand over). */
  actor(): number | null {
    if (this.phase === "auction") return this.bidTurn;
    if (this.phase === "discard") return this.contract!.bidder;
    if (this.phase === "play") return this.toPlay();
    return null;
  }

  private applyingAi = false;
  private reviewing(seat: number) {
    return this.humans[seat] && !this.applyingAi;
  }
  private baseView(seat: number) {
    return { seat, dealer: this.dealer, rules: this.rules, scores: this.scores, auction: this.auction.slice(), rng: this.adviceRng };
  }

  /** Let the computer act for the seat due to move (not a person's seat, unless `forHuman`). */
  aiStep(forHuman = false) {
    const seat = this.actor();
    if (seat === null || (this.humans[seat] && !forHuman)) return;
    this.applyingAi = true;
    try {
      this.aiAct(seat);
    } finally {
      this.applyingAi = false;
    }
  }

  private aiAct(seat: number) {
    const base = { seat, dealer: this.dealer, rules: this.rules, scores: this.scores, auction: this.auction.slice(), rng: this.rng };
    if (this.phase === "auction") {
      const legal = this.legalBids();
      this.bid(seat, this.ai.bid({ ...base, hand: this.hands[seat].slice(), legal }));
    } else if (this.phase === "discard") {
      this.discard(this.ai.discard({ ...base, hand: this.hands[seat].slice(), contract: this.contract!, kitty: this.kitty.slice() }));
    } else if (this.phase === "play") {
      const view = viewFor(this.play!, seat, this.rng);
      const card = this.ai.play(view);
      const named = this.needsJokerSuit(card) ? (this.ai.jokerSuit?.(view) ?? defaultJokerSuit(this.hands[seat])) : undefined;
      this.playCard(seat, card, named);
    }
  }

  /** Is this seat sitting out (the misère bidder's partner)? */
  sittingOut(seat: number): boolean {
    return !!this.contract?.misere && this.phase !== "discard" && seat === (this.contract.bidder + 2) % 4;
  }

  /** Cards on the table for the current (or just-finished) trick. */
  trickOnTable() {
    if (this.lastTrick) return this.lastTrick.plays;
    return this.play?.current ?? [];
  }

  tricksWon(): [number, number] {
    return this.play ? [this.play.teamTricks[0], this.play.teamTricks[1]] : [0, 0];
  }

  // --- Sending the table to another player's screen ------------------------------

  /**
   * What the player in `seat` may see: their own cards, card counts for everyone
   * else (and the open misère hand once play starts), and their own review.
   */
  snapshot(seat: number): TableSnapshot {
    const exposedSeat = this.contract?.open && this.play ? this.contract.bidder : -1;
    const hide = (cards: Card[], owner: number) => (owner === seat || owner === exposedSeat ? cards.slice() : cards.map(() => HIDDEN));
    const hands = this.hands.map(hide);
    const isBidder = this.contract?.bidder === seat;
    return {
      rules: this.rules, scores: this.scores, dealer: this.dealer, handNo: this.handNo, gameNo: this.gameNo,
      phase: this.phase, hands, kitty: isBidder && this.phase === "discard" ? this.kitty.slice() : [],
      auction: this.auction, passed: this.passed, high: this.high, bidTurn: this.bidTurn,
      contract: this.contract, discarded: isBidder ? this.discarded : [],
      play: this.play ? { ...this.play, hands, discarded: isBidder ? this.play.discarded : [] } : null,
      lastTrick: this.lastTrick, jokerNamed: this.jokerNamed, summary: this.summary, gameWinner: this.gameWinner,
      humans: this.humans, names: this.names, ready: this.ready, collecting: this.collecting,
      review: this.review.filter((r) => r.seat === seat),
    };
  }

  /** Rebuild a table (for display only) from a snapshot sent by the host. */
  static fromSnapshot(snap: TableSnapshot): Table {
    const t = Object.create(Table.prototype) as Table;
    Object.assign(t, snap);
    if (t.play) t.hands = t.play.hands;
    return t;
  }
}

export type TableSnapshot = Pick<Table,
  "rules" | "scores" | "dealer" | "handNo" | "gameNo" | "phase" | "hands" | "kitty" | "auction" | "passed" | "high" |
  "bidTurn" | "contract" | "discarded" | "play" | "lastTrick" | "jokerNamed" | "summary" | "gameWinner" | "humans" |
  "names" | "ready" | "collecting" | "review">;

export { SUITS };
