import { Card, Suit, SUITS, isJoker, makeDeck, suitOf } from "./cards.ts";
import { Rng, deriveSeed, makeRng, shuffle } from "./rng.ts";
import {
  AuctionEntry,
  BidAction,
  Contract,
  HandScore,
  Play,
  RulesConfig,
  activeSeats,
  bidLabel,
  effectiveSuit,
  gameWinner,
  legalBids,
  legalPlays,
  makeContract,
  sameBid,
  scoreHand,
  teamOf,
  trickWinnerIndex,
} from "./rules.ts";
import { CompletedTrick, PlayView, Strategy } from "./player.ts";

export interface Deal {
  hands: Card[][]; // four hands of 10
  kitty: Card[]; // 3 cards
}

export function dealCards(rng: Rng): Deal {
  const deck = shuffle(makeDeck(), rng);
  return {
    hands: [0, 1, 2, 3].map((s) => deck.slice(s * 10, s * 10 + 10)),
    kitty: deck.slice(40, 43),
  };
}

export interface HandResult {
  dealer: number;
  deal: Deal;
  auction: AuctionEntry[];
  /** null if everyone passed (a redeal). */
  contract: Contract | null;
  discarded: Card[] | null;
  tricks: CompletedTrick[];
  /** Tricks won per team. */
  teamTricks: [number, number];
  score: HandScore | null;
}

export class IllegalMoveError extends Error {}

function remove(hand: Card[], card: Card): Card[] {
  const i = hand.indexOf(card);
  if (i < 0) throw new IllegalMoveError(`Card ${card} not in hand`);
  return [...hand.slice(0, i), ...hand.slice(i + 1)];
}

export interface PlayHandOptions {
  deal: Deal;
  dealer: number;
  players: Strategy[]; // indexed by seat
  scores: [number, number];
  rules: RulesConfig;
  rng: Rng;
}

/** Run the auction. Returns the auction history and the winning (seat, bid) or null. */
export function runAuction(opts: PlayHandOptions, hands: Card[][]) {
  const { dealer, players, rules, rng, scores } = opts;
  const auction: AuctionEntry[] = [];
  const passed = [false, false, false, false];
  let high: { seat: number; bid: NonNullable<BidAction> } | null = null;
  let seat = (dealer + 1) % 4;

  for (;;) {
    if (!passed[seat]) {
      // If this player is the high bidder, everyone else has passed: done.
      if (high && high.seat === seat) break;
      const legal = legalBids(auction, rules);
      let bid: BidAction = null;
      if (legal.length > 0) {
        bid = players[seat].bid({
          seat, dealer, rules, scores, hand: hands[seat].slice(), auction: auction.slice(), rng, legal,
        });
        if (bid !== null && !legal.some((b) => sameBid(b, bid!))) {
          throw new IllegalMoveError(`${players[seat].name} (seat ${seat}) made illegal bid ${bidLabel(bid)}`);
        }
      }
      auction.push({ seat, bid });
      if (bid === null) passed[seat] = true;
      else high = { seat, bid };
      if (passed.every((p) => p)) break; // all four passed: redeal
    }
    seat = (seat + 1) % 4;
  }
  return { auction, high };
}

export function playHand(opts: PlayHandOptions): HandResult {
  const { deal, dealer, players, scores, rules, rng } = opts;
  const hands = deal.hands.map((h) => h.slice());
  const { auction, high } = runAuction(opts, hands);
  const base = { dealer, deal, auction };

  if (!high) {
    return { ...base, contract: null, discarded: null, tricks: [], teamTricks: [0, 0], score: null };
  }

  const contract = makeContract(high.bid, high.seat);
  const bidder = high.seat;

  // Kitty
  const thirteen = [...hands[bidder], ...deal.kitty];
  const discarded = players[bidder].discard({
    seat: bidder, dealer, rules, scores, hand: thirteen.slice(), auction: auction.slice(), rng,
    contract, kitty: deal.kitty.slice(),
  });
  if (discarded.length !== 3 || new Set(discarded).size !== 3) {
    throw new IllegalMoveError(`${players[bidder].name} must discard exactly 3 distinct cards`);
  }
  let bidderHand = thirteen;
  for (const c of discarded) bidderHand = remove(bidderHand, c);
  hands[bidder] = bidderHand;

  const state: PlayState = {
    contract, auction, dealer, scores, rules, hands, discarded,
    tricks: [], current: [], ledSuit: null, leader: bidder, teamTricks: [0, 0],
  };
  continuePlay(state, players, rng);
  const score = scoreHand(contract, state.teamTricks, rules);
  return { ...base, contract, discarded, tricks: state.tricks, teamTricks: state.teamTricks, score };
}

// ---------------------------------------------------------------------------
// Card play as a resumable state, so simulations can start mid-hand.
// ---------------------------------------------------------------------------

export interface PlayState {
  contract: Contract;
  auction: AuctionEntry[];
  dealer: number;
  scores: [number, number];
  rules: RulesConfig;
  /** Current hands (the misère bidder's partner keeps theirs but never plays). */
  hands: Card[][];
  /** The bidder's three discards. */
  discarded: Card[];
  tricks: CompletedTrick[];
  current: Play[];
  ledSuit: Suit | null;
  /** Leader of the current trick. */
  leader: number;
  teamTricks: [number, number];
}

export function cloneState(s: PlayState): PlayState {
  return {
    ...s,
    hands: s.hands.map((h) => h.slice()),
    tricks: s.tricks.slice(),
    current: s.current.slice(),
    teamTricks: [s.teamTricks[0], s.teamTricks[1]],
  };
}

/** The seat due to play next. */
export function seatToPlay(s: PlayState): number {
  const seats = activeSeats(s.contract);
  let seat = s.leader;
  for (let i = 0; i < s.current.length; i++) {
    seat = (seat + 1) % 4;
    while (!seats.includes(seat)) seat = (seat + 1) % 4;
  }
  return seat;
}

export function isHandOver(s: PlayState): boolean {
  return s.tricks.length === 10;
}

export function viewFor(s: PlayState, seat: number, rng: Rng): PlayView {
  const bidder = s.contract.bidder;
  return {
    seat, dealer: s.dealer, rules: s.rules, scores: s.scores, hand: s.hands[seat].slice(),
    auction: s.auction, rng, contract: s.contract, activeSeats: activeSeats(s.contract),
    tricks: s.tricks.slice(), current: s.current.slice(), ledSuit: s.ledSuit,
    legal: legalPlays(s.hands[seat], s.ledSuit, s.contract.trump),
    exposed: s.contract.open && seat !== bidder ? s.hands[bidder].slice() : null,
    discarded: seat === bidder ? s.discarded.slice() : null,
  };
}

/**
 * Play one card for the seat due to play (mutates the state). `jokerSuit` is
 * required when leading the Joker in no-trumps.
 */
export function applyPlay(s: PlayState, card: Card, jokerSuit?: Suit): void {
  const seat = seatToPlay(s);
  if (s.ledSuit === null) {
    if (isJoker(card) && s.contract.trump === null) {
      if (!jokerSuit || !SUITS.includes(jokerSuit)) throw new IllegalMoveError(`Bad Joker suit ${jokerSuit}`);
      s.ledSuit = jokerSuit;
    } else {
      s.ledSuit = effectiveSuit(card, s.contract.trump);
    }
  }
  s.current.push({ seat, card });
  s.hands[seat] = remove(s.hands[seat], card);
  if (s.current.length === activeSeats(s.contract).length) {
    const winner = s.current[trickWinnerIndex(s.current, s.ledSuit!, s.contract.trump)].seat;
    s.tricks.push({ leader: s.leader, plays: s.current, ledSuit: s.ledSuit!, winner });
    s.teamTricks[teamOf(winner)]++;
    s.leader = winner;
    s.current = [];
    s.ledSuit = null;
  }
}

/** Ask the seat due to play for one card and apply it (mutates the state). */
export function stepPlay(s: PlayState, players: Strategy[], rng: Rng, validate = true): void {
  const seat = seatToPlay(s);
  const view = viewFor(s, seat, rng);
  const card = players[seat].play(view);
  if (validate && !view.legal.includes(card)) {
    throw new IllegalMoveError(`${players[seat].name} (seat ${seat}) played illegal card ${card}`);
  }
  let named: Suit | undefined;
  if (s.ledSuit === null && isJoker(card) && s.contract.trump === null) {
    named = players[seat].jokerSuit?.(view) ?? defaultJokerSuit(s.hands[seat]);
  }
  applyPlay(s, card, named);
}

/** Ask each player in turn for a card until the hand is over (mutates the state). */
export function continuePlay(s: PlayState, players: Strategy[], rng: Rng, validate = true): void {
  while (!isHandOver(s)) stepPlay(s, players, rng, validate);
}

/** Default Joker suit when leading it in no-trumps: the suit we hold fewest of. */
export function defaultJokerSuit(hand: Card[]): Suit {
  const counts = SUITS.map((s) => hand.filter((c) => !isJoker(c) && suitOf(c) === s).length);
  return SUITS[counts.indexOf(Math.min(...counts))];
}

// ---------------------------------------------------------------------------
// Full games
// ---------------------------------------------------------------------------

export interface GameResult {
  /** Winning team, or null if the hand limit was hit. */
  winner: 0 | 1 | null;
  scores: [number, number];
  hands: HandResult[];
}

export interface PlayGameOptions {
  players: Strategy[];
  rules: RulesConfig;
  /** Seed for the deals. The same seed gives the same sequence of deals. */
  dealSeed: number;
  /** Seed for strategies' own randomness. */
  playerSeed: number;
  firstDealer?: number;
  maxHands?: number;
}

export function playGame(opts: PlayGameOptions): GameResult {
  const { players, rules, dealSeed, playerSeed } = opts;
  const maxHands = opts.maxHands ?? 300;
  let dealer = opts.firstDealer ?? 0;
  const scores: [number, number] = [0, 0];
  const hands: HandResult[] = [];
  const playerRng = makeRng(playerSeed);

  for (let h = 0; h < maxHands; h++) {
    const deal = dealCards(makeRng(deriveSeed(dealSeed, h)));
    const result = playHand({ deal, dealer, players, scores: [scores[0], scores[1]], rules, rng: playerRng });
    hands.push(result);
    dealer = (dealer + 1) % 4;
    if (!result.score || !result.contract) continue;
    scores[0] += result.score.points[0];
    scores[1] += result.score.points[1];
    const w = gameWinner(scores, teamOf(result.contract.bidder), rules);
    if (w !== null) return { winner: w, scores, hands };
  }
  return { winner: null, scores, hands };
}
