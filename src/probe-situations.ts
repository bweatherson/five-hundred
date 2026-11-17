// Situations for the single-decision probe (src/probe.ts). Each one recognises a
// decision point from the deciding player's own view, labels a sub-case, and
// lists the candidate plays to compare. A candidate returns null when it
// doesn't apply; the probe only uses positions where every candidate applies.
import { Card, Suit, SUITS, isJoker, rankOf, suitOf } from "./cards.ts";
import { PlayView } from "./player.ts";
import { PlayState } from "./game.ts";
import { cardPower, effectiveSuit, isTrump, teamOf } from "./rules.ts";
import { knownVoids } from "./strategies/sampling.ts";
import { isBoss, unseenCards, sideSuitCards, currentWinner } from "./strategies/util.ts";

export interface Option {
  name: string;
  /** Optional options are compared only where they apply; the first two must always apply. */
  choose(v: PlayView): Card | null;
  /** Suit to name when the chosen card is the Joker led in no-trumps (default: the player's own choice). */
  suit?(v: PlayView): Suit | null;
}

export interface Situation {
  name: string;
  describe: string;
  /** Sub-case label if this decision matches, else null. */
  match(v: PlayView, s: PlayState): string | null;
  options: Option[];
  /** Fire again in the same hand when this key differs (default: once per hand). */
  key?(v: PlayView): string;
}

// --- helpers ---------------------------------------------------------------

const trumpsIn = (cards: Card[], trump: Suit) => cards.filter((c) => isTrump(c, trump));
const power = (c: Card, suit: Suit, trump: Suit | null) => cardPower(c, suit, trump);
const lowest = (cards: Card[], suit: Suit, trump: Suit | null) =>
  cards.length ? cards.reduce((a, b) => (power(b, suit, trump) < power(a, suit, trump) ? b : a)) : null;
const highest = (cards: Card[], suit: Suit, trump: Suit | null) =>
  cards.length ? cards.reduce((a, b) => (power(b, suit, trump) > power(a, suit, trump) ? b : a)) : null;

function suitContract(v: PlayView): Suit | null {
  return v.contract.misere ? null : v.contract.trump;
}

/** Bidder's side tricks still needed to make (≤0 = made). */
function bidderNeeds(v: PlayView): number {
  const bt = teamOf(v.contract.bidder);
  const won = v.tricks.filter((t) => teamOf(t.winner) === bt).length;
  return (v.contract.bid as { tricks: number }).tricks - won;
}
/** Defenders' tricks still needed to set. */
function defNeeds(v: PlayView): number {
  const lost = v.tricks.length - (v.tricks.filter((t) => teamOf(t.winner) === teamOf(v.contract.bidder)).length);
  return 11 - (v.contract.bid as { tricks: number }).tricks - lost;
}
/** Has `seat` shown out of trumps? */
function outOfTrumps(v: PlayView, seat: number): boolean {
  return v.contract.trump !== null && knownVoids(v)[seat].has(v.contract.trump);
}
/** Lowest card of the hand that is not a trump (any suit), for discarding. */
function lowestSide(hand: Card[], trump: Suit): Card | null {
  const side = hand.filter((c) => !isTrump(c, trump));
  return side.length ? side.reduce((a, b) => (rankOf(b) < rankOf(a) ? b : a)) : null;
}
const band = (n: number) => (n <= 0 ? "made/set" : n === 1 ? "need1" : n === 2 ? "need2" : "need3+");

// --- 1. Defender leading a suit the bidder is void in ------------------------

function voidLead(target: "bidder" | "partner"): Situation {
  // The side suit to consider: one the target is void in, where I hold the boss
  // and at least one low card. Cached per view.
  const pick = (v: PlayView): Suit | null => {
    const trump = suitContract(v);
    if (trump === null || v.current.length > 0) return null;
    const bidder = v.contract.bidder;
    if (teamOf(v.seat) === teamOf(bidder)) return null;
    const t = target === "bidder" ? bidder : (bidder + 2) % 4;
    const other = target === "bidder" ? (bidder + 2) % 4 : bidder;
    if (outOfTrumps(v, t)) return null;
    const voids = knownVoids(v);
    const unseen = unseenCards(v);
    for (const su of SUITS) {
      if (su === trump || !voids[t].has(su)) continue;
      if (target === "partner" && voids[other].has(su)) continue;
      const mine = sideSuitCards(v.hand, su, trump);
      if (mine.length < 2) continue;
      const top = highest(mine, su, trump)!;
      if (!isBoss(top, v, unseen)) continue;
      return su;
    }
    return null;
  };
  return {
    name: target === "bidder" ? "lead-into-bidder-void" : "lead-into-partner-void",
    describe: target === "bidder"
      ? "Defender on lead, bidder has shown out of side suit X (not of trumps); I hold the boss of X plus a low X."
      : "Defender on lead, bidder's partner has shown out of side suit X (bidder hasn't); I hold the boss of X plus a low X.",
    match(v) {
      const su = pick(v);
      if (!su) return null;
      const bidderPos = (v.contract.bidder - v.seat + 4) % 4; // 1 = bidder plays 2nd
      const unseenTrumps = trumpsIn(unseenCards(v), v.contract.trump!).length;
      const myTrumps = trumpsIn(v.hand, v.contract.trump!).length;
      return `bidder ${bidderPos === 1 ? "2nd" : "4th"}, trick ${v.tricks.length + 1 <= 5 ? "≤5" : "6+"}, ` +
        `trumps out ${unseenTrumps <= 2 ? unseenTrumps : "3+"}, mine ${Math.min(myTrumps, 2)}${myTrumps >= 2 ? "+" : ""}`;
    },
    options: [
      { name: "boss of X", choose: (v) => { const su = pick(v); return su && highest(sideSuitCards(v.hand, su, v.contract.trump), su, v.contract.trump); } },
      { name: "low X", choose: (v) => { const su = pick(v); return su && lowest(sideSuitCards(v.hand, su, v.contract.trump), su, v.contract.trump); } },
      {
        name: "other suit (low)",
        choose: (v) => {
          const su = pick(v);
          const trump = v.contract.trump!;
          const rest = v.hand.filter((c) => !isTrump(c, trump) && effectiveSuit(c, trump) !== su);
          return rest.length ? rest.reduce((a, b) => (rankOf(b) < rankOf(a) ? b : a)) : null;
        },
      },
      {
        name: "trump",
        choose: (v) => {
          const trump = v.contract.trump!;
          return lowest(trumpsIn(v.hand, trump), trump, trump);
        },
      },
    ],
  };
}

// --- 2. Bidder second to play, void in the led side suit ----------------------

function bidderVoidSecond(): Situation {
  const ok = (v: PlayView) => {
    const trump = suitContract(v);
    if (trump === null || v.seat !== v.contract.bidder || v.current.length !== 1) return false;
    if (v.ledSuit === trump) return false;
    if (v.legal.some((c) => effectiveSuit(c, trump) === v.ledSuit)) return false; // can follow
    if (trumpsIn(v.hand, trump).length === 0) return false;
    return v.hand.some((c) => !isTrump(c, trump)); // something to throw
  };
  return {
    name: "bidder-void-second",
    describe: "Bidder plays second, void in the led side suit, holding trumps and a side card to throw.",
    match(v) {
      if (!ok(v)) return null;
      const trump = v.contract.trump!;
      const led = v.current[0].card;
      const unseen = unseenCards(v);
      const ledBoss = isBoss(led, v, unseen);
      const mine = trumpsIn(v.hand, trump).length;
      const out = trumpsIn(unseen, trump).length;
      return `led ${ledBoss ? "boss" : "low"}, my trumps ${mine >= 3 ? "3+" : mine}, trumps out ${out >= 3 ? "3+" : out}, ${band(bidderNeeds(v))}`;
    },
    options: [
      { name: "ruff low", choose: (v) => (ok(v) ? lowest(trumpsIn(v.hand, v.contract.trump!), v.contract.trump!, v.contract.trump) : null) },
      { name: "discard", choose: (v) => (ok(v) ? lowestSide(v.hand, v.contract.trump!) : null) },
      { name: "ruff high", choose: (v) => { if (!ok(v)) return null; const t = trumpsIn(v.hand, v.contract.trump!); return t.length > 1 ? highest(t, v.contract.trump!, v.contract.trump) : null; } },
    ],
  };
}

// --- 3. Bidder on lead with one or two trumps out ----------------------------

function bidderLastTrumps(): Situation {
  const ok = (v: PlayView) => {
    const trump = suitContract(v);
    if (trump === null || v.seat !== v.contract.bidder || v.current.length > 0) return false;
    const mine = trumpsIn(v.hand, trump);
    if (mine.length < 2 || mine.length === v.hand.length) return false;
    const out = trumpsIn(unseenCards(v), trump).length;
    return out >= 1 && out <= 2;
  };
  const sideBoss = (v: PlayView) => {
    const trump = v.contract.trump!;
    const unseen = unseenCards(v);
    const b = v.hand.filter((c) => !isTrump(c, trump) && isBoss(c, v, unseen));
    return b.length ? b[0] : null;
  };
  return {
    name: "bidder-last-trumps",
    describe: "Bidder on lead with 2+ trumps and side cards; one or two trumps still out.",
    match(v) {
      if (!ok(v)) return null;
      const trump = v.contract.trump!;
      const unseen = unseenCards(v);
      const out = trumpsIn(unseen, trump).length;
      const top = highest(trumpsIn(v.hand, trump), trump, trump)!;
      const bossT = isBoss(top, v, unseen);
      return `out ${out}, ${bossT ? "hold boss trump" : "no boss trump"}, ${sideBoss(v) ? "side winner" : "no side winner"}, ${band(bidderNeeds(v))}`;
    },
    options: [
      { name: "top trump", choose: (v) => (ok(v) ? highest(trumpsIn(v.hand, v.contract.trump!), v.contract.trump!, v.contract.trump) : null) },
      { name: "low trump", choose: (v) => (ok(v) ? lowest(trumpsIn(v.hand, v.contract.trump!), v.contract.trump!, v.contract.trump) : null) },
      { name: "side winner or low side", choose: (v) => (ok(v) ? sideBoss(v) ?? lowestSide(v.hand, v.contract.trump!) : null) },
      { name: "low side", choose: (v) => (ok(v) ? lowestSide(v.hand, v.contract.trump!) : null) },
    ],
  };
}

// --- 4. Defender second hand: win with the boss or duck? ----------------------

function secondHandBoss(): Situation {
  const ok = (v: PlayView) => {
    const trump = suitContract(v);
    if (trump === null || v.current.length !== 1 || v.current[0].seat !== v.contract.bidder) return false;
    if (v.ledSuit === trump || teamOf(v.seat) === teamOf(v.contract.bidder)) return false;
    const mine = sideSuitCards(v.hand, v.ledSuit!, trump);
    if (mine.length < 2) return false;
    const unseen = unseenCards(v);
    const top = highest(mine, v.ledSuit!, trump)!;
    return isBoss(top, v, unseen) && power(top, v.ledSuit!, trump) > power(v.current[0].card, v.ledSuit!, trump);
  };
  return {
    name: "second-hand-boss",
    describe: "Bidder leads a side suit; I'm second (a defender) holding the boss of it and a low card.",
    match(v) {
      if (!ok(v)) return null;
      const trump = v.contract.trump!;
      const voids = knownVoids(v);
      const bp = (v.contract.bidder + 2) % 4;
      const partnerVoid = voids[bp].has(v.ledSuit!) ? "bidder's partner void" : "partner of bidder not known void";
      return `${partnerVoid}, len ${Math.min(sideSuitCards(v.hand, v.ledSuit!, trump).length, 3)}${sideSuitCards(v.hand, v.ledSuit!, trump).length >= 3 ? "+" : ""}, ${band(defNeeds(v))}`;
    },
    options: [
      { name: "win with boss", choose: (v) => (ok(v) ? highest(sideSuitCards(v.hand, v.ledSuit!, v.contract.trump), v.ledSuit!, v.contract.trump) : null) },
      { name: "duck low", choose: (v) => (ok(v) ? lowest(sideSuitCards(v.hand, v.ledSuit!, v.contract.trump), v.ledSuit!, v.contract.trump) : null) },
    ],
  };
}

// --- 5. Bidder's partner on lead --------------------------------------------

function partnerLead(): Situation {
  const ok = (v: PlayView) => {
    const trump = suitContract(v);
    return trump !== null && v.current.length === 0 && v.seat === (v.contract.bidder + 2) % 4 && v.hand.length >= 2;
  };
  const bidderVoidSuit = (v: PlayView): Suit | null => {
    const trump = v.contract.trump!;
    if (outOfTrumps(v, v.contract.bidder)) return null;
    const voids = knownVoids(v);
    for (const su of SUITS) if (su !== trump && voids[v.contract.bidder].has(su) && sideSuitCards(v.hand, su, trump).length) return su;
    return null;
  };
  return {
    name: "bidders-partner-lead",
    describe: "Bidder's partner on lead in a trump contract.",
    match(v) {
      if (!ok(v)) return null;
      const trump = v.contract.trump!;
      const mine = trumpsIn(v.hand, trump).length;
      return `my trumps ${Math.min(mine, 2)}${mine >= 2 ? "+" : ""}, ${bidderVoidSuit(v) ? "can lead bidder's void" : "no known bidder void"}, ${band(bidderNeeds(v))}`;
    },
    options: [
      { name: "top trump", choose: (v) => (ok(v) ? highest(trumpsIn(v.hand, v.contract.trump!), v.contract.trump!, v.contract.trump) : null) },
      { name: "low trump", choose: (v) => (ok(v) ? lowest(trumpsIn(v.hand, v.contract.trump!), v.contract.trump!, v.contract.trump) : null) },
      {
        name: "into bidder's void",
        choose: (v) => {
          if (!ok(v)) return null;
          const su = bidderVoidSuit(v);
          return su ? lowest(sideSuitCards(v.hand, su, v.contract.trump), su, v.contract.trump) : null;
        },
      },
      {
        name: "side boss",
        choose: (v) => {
          if (!ok(v)) return null;
          const unseen = unseenCards(v);
          return v.hand.find((c) => !isTrump(c, v.contract.trump!) && isBoss(c, v, unseen)) ?? null;
        },
      },
    ],
  };
}

// --- 6. Defender fourth, partner's card is losing to the bidder's partner's ... -
// (Third seat defender: should I play my boss on partner's lead, or let it go?)

function defenderThird(): Situation {
  const ok = (v: PlayView) => {
    const trump = suitContract(v);
    if (trump === null || v.current.length !== 2 || teamOf(v.seat) === teamOf(v.contract.bidder)) return false;
    if (v.current[0].seat !== (v.seat + 2) % 4 || v.ledSuit === trump) return false; // partner led a side suit
    const w = currentWinner(v)!;
    if (w.seat !== v.current[0].seat) return false; // partner's card is winning so far
    const mine = sideSuitCards(v.hand, v.ledSuit!, trump);
    if (mine.length < 2) return false;
    const top = highest(mine, v.ledSuit!, trump)!;
    return power(top, v.ledSuit!, trump) > w.power;
  };
  return {
    name: "defender-third-overtake",
    describe: "Partner led a side suit and is winning after the second player; I can overtake (bidder plays last).",
    match(v) {
      if (!ok(v)) return null;
      const pBoss = isBoss(v.current[0].card, v);
      const bidderVoid = knownVoids(v)[v.contract.bidder].has(v.ledSuit!);
      return `partner's card ${pBoss ? "is boss" : "not boss"}, bidder ${bidderVoid ? "void" : "not known void"}`;
    },
    options: [
      { name: "overtake high", choose: (v) => (ok(v) ? highest(sideSuitCards(v.hand, v.ledSuit!, v.contract.trump), v.ledSuit!, v.contract.trump) : null) },
      { name: "play low", choose: (v) => (ok(v) ? lowest(sideSuitCards(v.hand, v.ledSuit!, v.contract.trump), v.ledSuit!, v.contract.trump) : null) },
    ],
  };
}

// --- 8. Discards on a trump lead -------------------------------------------

/** Suits a seat has thrown (not followed, not trumped) so far. */
function thrownSuits(v: PlayView, seat: number): Set<Suit> {
  const trump = v.contract.trump;
  const out = new Set<Suit>();
  for (const t of [...v.tricks, { plays: v.current, ledSuit: v.ledSuit }]) {
    for (const pl of t.plays) {
      if (pl.seat !== seat || t.ledSuit === null || isJoker(pl.card)) continue;
      const su = effectiveSuit(pl.card, trump) as Suit;
      if (su !== t.ledSuit && su !== trump) out.add(su);
    }
  }
  return out;
}

function trumpLeadDiscard(who: "defender" | "partner"): Situation {
  const ok = (v: PlayView) => {
    const trump = suitContract(v);
    if (trump === null || v.current.length === 0 || v.ledSuit !== trump) return false;
    if (v.current[0].seat !== v.contract.bidder) return false;
    if (who === "defender" ? teamOf(v.seat) === teamOf(v.contract.bidder) : v.seat !== (v.contract.bidder + 2) % 4) return false;
    if (v.legal.some((c) => isTrump(c, trump))) return false; // can follow
    const suits = new Set(v.hand.map((c) => effectiveSuit(c, trump)));
    return suits.size >= 2;
  };
  const side = (v: PlayView) => v.hand.filter((c) => !isJoker(c));
  const bySuit = (v: PlayView) => {
    const m = new Map<Suit, Card[]>();
    for (const c of side(v)) { const su = effectiveSuit(c, v.contract.trump) as Suit; m.set(su, [...(m.get(su) ?? []), c]); }
    return m;
  };
  const low = (cs: Card[]) => cs.reduce((a, b) => (rankOf(b) < rankOf(a) ? b : a));
  const nonBoss = (v: PlayView) => { const u = unseenCards(v); return side(v).filter((c) => !isBoss(c, v, u)); };
  const fromSuit = (v: PlayView, pickSuit: (m: Map<Suit, Card[]>) => Suit | null) => {
    const m = bySuit(v);
    const su = pickSuit(m);
    return su ? low(m.get(su)!) : null;
  };
  return {
    name: who === "defender" ? "defender-discard-on-trumps" : "partner-discard-on-trumps",
    describe: who === "defender"
      ? "The bidder leads a trump; I'm a defender out of trumps, holding cards in 2+ side suits."
      : "The bidder leads a trump; I'm the bidder's partner, out of trumps, holding cards in 2+ side suits.",
    match(v) {
      if (!ok(v)) return null;
      const m = bySuit(v);
      const u = unseenCards(v);
      const bosses = side(v).filter((c) => isBoss(c, v, u)).length;
      return `trick ${v.tricks.length + 1 <= 4 ? "≤4" : v.tricks.length + 1 <= 7 ? "5-7" : "8+"}, ${m.size} suits, ${bosses ? "hold boss" : "no boss"}, ` +
        (who === "defender" ? band(defNeeds(v)) : band(bidderNeeds(v)));
    },
    options: [
      { name: "lowest card", choose: (v) => (ok(v) ? low(side(v)) : null) },
      { name: "shortest suit", choose: (v) => (ok(v) ? fromSuit(v, (m) => [...m.keys()].reduce((a, b) => (m.get(b)!.length < m.get(a)!.length ? b : a))) : null) },
      { name: "longest suit", choose: (v) => (ok(v) ? fromSuit(v, (m) => [...m.keys()].reduce((a, b) => (m.get(b)!.length > m.get(a)!.length ? b : a))) : null) },
      { name: "lowest non-boss", choose: (v) => { if (!ok(v)) return null; const nb = nonBoss(v); return nb.length ? low(nb) : null; } },
      {
        name: "suit an opponent is void in",
        choose: (v) => {
          if (!ok(v)) return null;
          const voids = knownVoids(v);
          const opps = [0, 1, 2, 3].filter((x) => teamOf(x) !== teamOf(v.seat));
          return fromSuit(v, (m) => [...m.keys()].find((su) => opps.some((o) => voids[o].has(su))) ?? null);
        },
      },
      {
        name: "suit partner threw",
        choose: (v) => {
          if (!ok(v)) return null;
          const t = thrownSuits(v, (v.seat + 2) % 4);
          return fromSuit(v, (m) => [...m.keys()].find((su) => t.has(su)) ?? null);
        },
      },
      {
        name: "not partner's thrown suit",
        choose: (v) => {
          if (!ok(v)) return null;
          const t = thrownSuits(v, (v.seat + 2) % 4);
          if (t.size === 0) return null;
          const rest = side(v).filter((c) => !t.has(effectiveSuit(c, v.contract.trump) as Suit));
          return rest.length ? low(rest) : null;
        },
      },
    ],
  };
}

// --- 9. No-trumps Joker -------------------------------------------------------

function ntContract(v: PlayView) {
  return !v.contract.misere && v.contract.trump === null;
}
function ntSide(v: PlayView): string {
  return v.seat === v.contract.bidder ? "bidder" : teamOf(v.seat) === teamOf(v.contract.bidder) ? "bidder's partner" : "defender";
}
function ntNeed(v: PlayView): string {
  return teamOf(v.seat) === teamOf(v.contract.bidder) ? band(bidderNeeds(v)) : band(defNeeds(v));
}

function ntJokerLead(): Situation {
  const ok = (v: PlayView) => ntContract(v) && v.current.length === 0 && v.hand.includes("JK") && v.hand.length >= 2;
  const counts = (v: PlayView) => SUITS.map((su) => v.hand.filter((c) => !isJoker(c) && suitOf(c) === su).length);
  const longest = (v: PlayView): Suit => { const n = counts(v); return SUITS[n.indexOf(Math.max(...n))]; };
  const shortestHeld = (v: PlayView): Suit | null => {
    const n = counts(v); let best: Suit | null = null;
    SUITS.forEach((su, k) => { if (n[k] > 0 && (best === null || n[k] < n[SUITS.indexOf(best)])) best = su; });
    return best;
  };
  const oppVoid = (v: PlayView): Suit | null => {
    const voids = knownVoids(v);
    const opps = v.activeSeats.filter((x) => teamOf(x) !== teamOf(v.seat));
    return SUITS.find((su) => opps.some((o) => voids[o].has(su))) ?? null;
  };
  const sideBoss = (v: PlayView) => { const u = unseenCards(v); return v.hand.find((c) => !isJoker(c) && isBoss(c, v, u)) ?? null; };
  const lowLongest = (v: PlayView) => {
    const su = longest(v);
    const cs = v.hand.filter((c) => !isJoker(c) && suitOf(c) === su);
    return cs.reduce((a, b) => (rankOf(b) < rankOf(a) ? b : a));
  };
  return {
    name: "nt-joker-lead",
    describe: "No-trumps, on lead holding the Joker and other cards.",
    match(v) {
      if (!ok(v)) return null;
      const t = v.tricks.length + 1;
      return `${ntSide(v)}, trick ${t <= 3 ? "≤3" : t <= 6 ? "4-6" : "7+"}, ${sideBoss(v) ? "side winner" : "no side winner"}, ${ntNeed(v)}`;
    },
    options: [
      { name: "hold: side winner or low longest", choose: (v) => (ok(v) ? sideBoss(v) ?? lowLongest(v) : null) },
      { name: "Joker, name a void suit of mine", choose: (v) => (ok(v) && counts(v).some((n) => n === 0) ? "JK" : null), suit: (v) => SUITS[counts(v).indexOf(0)] ?? null },
      { name: "Joker, name shortest held", choose: (v) => (ok(v) && shortestHeld(v) ? "JK" : null), suit: (v) => shortestHeld(v) },
      { name: "Joker, name longest", choose: (v) => (ok(v) ? "JK" : null), suit: (v) => longest(v) },
      { name: "Joker, name opponent's void", choose: (v) => (ok(v) && oppVoid(v) ? "JK" : null), suit: (v) => oppVoid(v) },
      { name: "hold: low longest", choose: (v) => (ok(v) ? lowLongest(v) : null) },
    ],
  };
}

function ntJokerFollow(): Situation {
  const ok = (v: PlayView) => {
    if (!ntContract(v) || v.current.length === 0 || !v.hand.includes("JK")) return false;
    if (v.legal.some((c) => !isJoker(c) && suitOf(c) === v.ledSuit)) return false; // can follow
    return v.hand.length >= 2;
  };
  return {
    name: "nt-joker-follow",
    describe: "No-trumps, void in the led suit, holding the Joker: win with it now or discard?",
    match(v) {
      if (!ok(v)) return null;
      const w = currentWinner(v)!;
      const mine = teamOf(w.seat) === teamOf(v.seat) ? "partner winning" : "opponent winning";
      const pos = v.current.length === v.activeSeats.length - 1 ? "last" : `seat ${v.current.length + 1}`;
      const boss = isBoss(w.card, v) ? "winning card boss" : "winning card not boss";
      return `${ntSide(v)}, ${mine}, ${pos}, ${boss}, ${ntNeed(v)}`;
    },
    options: [
      { name: "Joker", choose: (v) => (ok(v) ? "JK" : null) },
      { name: "discard low", choose: (v) => { if (!ok(v)) return null; const s = v.hand.filter((c) => !isJoker(c)); return s.reduce((a, b) => (rankOf(b) < rankOf(a) ? b : a)); } },
    ],
  };
}

// --- 10. The Joker in trump contracts, and defenders leading trumps -----------

const nonJokerTrumps = (v: PlayView) => trumpsIn(v.hand, v.contract.trump!).filter((c) => !isJoker(c));
const trick3 = (v: PlayView) => { const t = v.tricks.length + 1; return t <= 3 ? "trick ≤3" : t <= 6 ? "trick 4-6" : "trick 7+"; };
/** Lowest card of my longest side suit (the heuristic's default non-cashing lead). */
function lowLongestSide(v: PlayView): Card | null {
  const trump = v.contract.trump!;
  const side = v.hand.filter((c) => !isJoker(c) && !isTrump(c, trump));
  if (!side.length) return null;
  const n = (su: Suit) => side.filter((c) => effectiveSuit(c, trump) === su).length;
  const su = SUITS.filter((x) => n(x) > 0).reduce((a, b) => (n(b) > n(a) ? b : a));
  return lowest(side.filter((c) => effectiveSuit(c, trump) === su), su, trump);
}
function lowShortestSide(v: PlayView): Card | null {
  const trump = v.contract.trump!;
  const side = v.hand.filter((c) => !isJoker(c) && !isTrump(c, trump));
  if (!side.length) return null;
  const n = (su: Suit) => side.filter((c) => effectiveSuit(c, trump) === su).length;
  const su = SUITS.filter((x) => n(x) > 0).reduce((a, b) => (n(b) < n(a) ? b : a));
  return lowest(side.filter((c) => effectiveSuit(c, trump) === su), su, trump);
}
function sideBossOrLow(v: PlayView): Card | null {
  const u = unseenCards(v);
  return v.hand.find((c) => !isJoker(c) && !isTrump(c, v.contract.trump!) && isBoss(c, v, u)) ?? lowLongestSide(v);
}
const ledLabel = (c: Card, trump: Suit) => {
  const p = cardPower(c, trump, trump);
  return p === 99 ? "led right bower" : p === 98 ? "led left bower" : "led lower trump";
};

/** Bidder leads a trump; a defender holding the Joker and another trump decides whether to spend the Joker. */
function defJokerOnTrumpLead(): Situation {
  const ok = (v: PlayView) => {
    const trump = suitContract(v);
    if (trump === null || v.ledSuit !== trump || v.current.length === 0 || v.current[0].seat !== v.contract.bidder) return false;
    if (teamOf(v.seat) === teamOf(v.contract.bidder) || !v.hand.includes("JK")) return false;
    return nonJokerTrumps(v).length > 0;
  };
  return {
    name: "def-joker-on-trump-lead",
    describe: "Trump contract; the bidder leads a trump. I'm a defender holding the Joker and at least one other trump.",
    match(v) {
      if (!ok(v)) return null;
      const trump = v.contract.trump!;
      const mine = nonJokerTrumps(v).length;
      const pos = v.current.length === 1 ? "2nd" : v.current.length === 2 ? "3rd" : "4th";
      return `${ledLabel(v.current[0].card, trump)}, ${pos}, other trumps ${mine >= 2 ? "2+" : 1}, ${band(defNeeds(v))}`;
    },
    options: [
      { name: "Joker", choose: (v) => (ok(v) ? "JK" : null) },
      { name: "low trump", choose: (v) => (ok(v) ? lowest(nonJokerTrumps(v), v.contract.trump!, v.contract.trump) : null) },
      {
        name: "trump that wins (not Joker)",
        choose: (v) => {
          if (!ok(v)) return null;
          const w = currentWinner(v)!;
          const b = nonJokerTrumps(v).filter((c) => power(c, v.ledSuit!, v.contract.trump) > w.power);
          return lowest(b, v.contract.trump!, v.contract.trump);
        },
      },
    ],
  };
}

/** Defender void in a led side suit, opponent winning, holding the Joker and other trumps. */
function defJokerRuff(): Situation {
  const ok = (v: PlayView) => {
    const trump = suitContract(v);
    if (trump === null || v.current.length === 0 || v.ledSuit === trump) return false;
    if (teamOf(v.seat) === teamOf(v.contract.bidder) || !v.hand.includes("JK")) return false;
    if (v.legal.some((c) => effectiveSuit(c, trump) === v.ledSuit)) return false;
    const w = currentWinner(v)!;
    if (teamOf(w.seat) === teamOf(v.seat)) return false;
    return nonJokerTrumps(v).length > 0;
  };
  const winTrump = (v: PlayView) => {
    const w = currentWinner(v)!;
    return lowest(nonJokerTrumps(v).filter((c) => power(c, v.ledSuit!, v.contract.trump) > w.power), v.contract.trump!, v.contract.trump);
  };
  return {
    name: "def-joker-ruff",
    describe: "Trump contract; side suit led, I'm a defender void in it, an opponent is winning, I hold the Joker and other trumps.",
    match(v) {
      if (!ok(v)) return null;
      const w = currentWinner(v)!;
      const pos = v.current.length === 1 ? "2nd" : v.current.length === 2 ? "3rd" : "4th";
      const ruffed = isTrump(w.card, v.contract.trump!) ? "already trumped" : "not trumped";
      return `${pos}, ${ruffed}, ${winTrump(v) ? "low trump wins" : "only Joker wins"}, ${band(defNeeds(v))}`;
    },
    options: [
      { name: "Joker", choose: (v) => (ok(v) ? "JK" : null) },
      { name: "lowest winning trump", choose: (v) => (ok(v) ? winTrump(v) : null) },
      { name: "discard", choose: (v) => (ok(v) ? lowestSide(v.hand.filter((c) => !isJoker(c)), v.contract.trump!) : null) },
    ],
  };
}

/** Defender on lead in a trump contract holding the Joker. */
function defJokerLead(): Situation {
  const ok = (v: PlayView) => {
    const trump = suitContract(v);
    if (trump === null || v.current.length > 0 || teamOf(v.seat) === teamOf(v.contract.bidder)) return false;
    return v.hand.includes("JK") && v.hand.some((c) => !isJoker(c) && !isTrump(c, trump));
  };
  return {
    name: "def-joker-lead",
    describe: "Trump contract; I'm a defender on lead holding the Joker and at least one side card.",
    match(v) {
      if (!ok(v)) return null;
      const mine = nonJokerTrumps(v).length;
      const bidderOut = outOfTrumps(v, v.contract.bidder) ? "bidder out of trumps" : "bidder has trumps";
      return `${trick3(v)}, other trumps ${mine >= 2 ? "2+" : mine}, ${bidderOut}, ${band(defNeeds(v))}`;
    },
    options: [
      { name: "hold: side boss or low longest", choose: (v) => (ok(v) ? sideBossOrLow(v) : null) },
      { name: "Joker", choose: (v) => (ok(v) ? "JK" : null) },
      { name: "low trump", choose: (v) => (ok(v) ? lowest(nonJokerTrumps(v), v.contract.trump!, v.contract.trump) : null) },
      { name: "low shortest side", choose: (v) => (ok(v) ? lowShortestSide(v) : null) },
    ],
  };
}

/** Defender on lead holding trumps (no Joker): should I lead one? */
function defLeadTrump(): Situation {
  const ok = (v: PlayView) => {
    const trump = suitContract(v);
    if (trump === null || v.current.length > 0 || teamOf(v.seat) === teamOf(v.contract.bidder) || v.hand.includes("JK")) return false;
    if (!v.hand.some((c) => !isTrump(c, trump))) return false;
    if (!unseenCards(v).some((c) => isTrump(c, trump))) return false;
    return nonJokerTrumps(v).length > 0;
  };
  const crossruff = (v: PlayView) => {
    const trump = v.contract.trump!;
    const voids = knownVoids(v);
    const bp = (v.contract.bidder + 2) % 4;
    const has = (s: number) => !voids[s].has(trump) && SUITS.some((su) => su !== trump && voids[s].has(su));
    return has(v.contract.bidder) || has(bp);
  };
  return {
    name: "def-lead-trump",
    describe: "Trump contract; I'm a defender on lead with trumps (no Joker) and side cards; trumps are still out.",
    match(v) {
      if (!ok(v)) return null;
      const mine = nonJokerTrumps(v).length;
      return `${trick3(v)}, my trumps ${mine >= 3 ? "3+" : mine}, ${crossruff(v) ? "an opponent can ruff a side suit" : "no ruff shown"}, ${band(defNeeds(v))}`;
    },
    options: [
      { name: "side boss or low longest", choose: (v) => (ok(v) ? sideBossOrLow(v) : null) },
      { name: "low trump", choose: (v) => (ok(v) ? lowest(nonJokerTrumps(v), v.contract.trump!, v.contract.trump) : null) },
      { name: "top trump", choose: (v) => (ok(v) ? highest(nonJokerTrumps(v), v.contract.trump!, v.contract.trump) : null) },
      { name: "low shortest side", choose: (v) => (ok(v) ? lowShortestSide(v) : null) },
    ],
  };
}

// --- 11. Misère defence ----------------------------------------------------------

const isMisDef = (v: PlayView) => v.contract.misere && v.seat !== v.contract.bidder;
const rk = (c: Card) => (isJoker(c) ? 99 : rankOf(c));
const lo = (cs: Card[]) => (cs.length ? cs.reduce((a, b) => (rk(b) < rk(a) ? b : a)) : null);
const hi = (cs: Card[]) => (cs.length ? cs.reduce((a, b) => (rk(b) > rk(a) ? b : a)) : null);
const plain = (cs: Card[]) => cs.filter((c) => !isJoker(c));
/** Cards the bidder may hold: the exposed hand in open misère, else everything unseen. */
const bidderPool = (v: PlayView) => v.exposed ? v.exposed.filter((c) => !v.tricks.some((t) => t.plays.some((p) => p.card === c)) && !v.current.some((p) => p.card === c)) : unseenCards(v);
/** Suits the bidder may still hold. */
const liveSuits = (v: PlayView): Suit[] => {
  const pool = bidderPool(v);
  const voids = knownVoids(v);
  return SUITS.filter((su) => !voids[v.contract.bidder].has(su) && pool.some((c) => !isJoker(c) && suitOf(c) === su));
};
/** My card is the lowest left in its suit (no unseen card below it). */
const isBottom = (v: PlayView, c: Card, unseen = unseenCards(v)) =>
  !isJoker(c) && !unseen.some((x) => !isJoker(x) && suitOf(x) === suitOf(c) && rankOf(x) < rankOf(c));
/** Lowest of my cards that is the bottom of a suit the bidder may still hold. */
const bottomLive = (v: PlayView, cards = v.legal): Card | null => {
  const u = unseenCards(v);
  const live = liveSuits(v);
  return lo(plain(cards).filter((c) => live.includes(suitOf(c)) && isBottom(v, c, u)));
};
const misTrick = (v: PlayView) => { const t = v.tricks.length + 1; return t <= 3 ? "trick ≤3" : t <= 6 ? "trick 4-6" : "trick 7+"; };
const misBand = (v: PlayView) => { const t = v.tricks.length + 1; return t <= 3 ? "a" : t <= 6 ? "b" : "c"; };

function misereLead(): Situation {
  const ok = (v: PlayView) => isMisDef(v) && v.current.length === 0 && plain(v.legal).length >= 2;
  const bySuit = (v: PlayView) => {
    const m = new Map<Suit, Card[]>();
    for (const c of plain(v.legal)) m.set(suitOf(c), [...(m.get(suitOf(c)) ?? []), c]);
    return m;
  };
  return {
    name: "misere-def-lead",
    describe: "Misère; I'm a defender on lead.",
    key: (v) => `${v.seat}${misBand(v)}`,
    match(v) {
      if (!ok(v)) return null;
      const last = (v.seat + 1) % 4 === v.contract.bidder ? "bidder 2nd" : "bidder last";
      return `${v.exposed ? "open" : "closed"}, ${last}, ${bottomLive(v) ? "hold a live bottom" : "no live bottom"}, ${misTrick(v)}`;
    },
    options: [
      { name: "lowest card", choose: (v) => (ok(v) ? lo(plain(v.legal)) : null) },
      { name: "live bottom card", choose: (v) => (ok(v) ? bottomLive(v) : null) },
      { name: "highest card", choose: (v) => (ok(v) ? hi(plain(v.legal)) : null) },
      {
        name: "strip: high card of a live suit where I hold the bottom",
        choose: (v) => {
          if (!ok(v)) return null;
          const u = unseenCards(v); const live = liveSuits(v);
          for (const [su, cs] of bySuit(v)) if (live.includes(su) && cs.length >= 2 && cs.some((c) => isBottom(v, c, u))) return hi(cs);
          return null;
        },
      },
      {
        name: "strip: high card of a live suit where I hold the 2nd-lowest",
        choose: (v) => {
          if (!ok(v)) return null;
          const u = unseenCards(v); const live = liveSuits(v);
          for (const [su, cs] of bySuit(v)) {
            if (!live.includes(su) || cs.length < 2) continue;
            const l = lo(cs)!;
            const below = u.filter((x) => !isJoker(x) && suitOf(x) === su && rankOf(x) < rankOf(l)).length;
            if (below === 1) return hi(cs);
          }
          return null;
        },
      },
      {
        name: "low in a suit partner is void in",
        choose: (v) => {
          if (!ok(v)) return null;
          const pv = knownVoids(v)[(v.seat + 2) % 4];
          const live = liveSuits(v);
          return lo(plain(v.legal).filter((c) => pv.has(suitOf(c)) && live.includes(suitOf(c))));
        },
      },
      { name: "low in shortest suit", choose: (v) => { if (!ok(v)) return null; const m = bySuit(v); const su = [...m.keys()].reduce((a, b) => (m.get(b)!.length < m.get(a)!.length ? b : a)); return lo(m.get(su)!); } },
      { name: "low in longest suit", choose: (v) => { if (!ok(v)) return null; const m = bySuit(v); const su = [...m.keys()].reduce((a, b) => (m.get(b)!.length > m.get(a)!.length ? b : a)); return lo(m.get(su)!); } },
    ],
  };
}

function misereFollow(): Situation {
  const ok = (v: PlayView) => isMisDef(v) && v.current.length > 0 && v.ledSuit !== null
    && v.legal.some((c) => !isJoker(c) && suitOf(c) === v.ledSuit) && plain(v.legal).length >= 2;
  const under = (v: PlayView) => { const w = currentWinner(v)!; return plain(v.legal).filter((c) => cardPower(c, v.ledSuit!, null) < w.power); };
  const where = (v: PlayView) => {
    const bidderPlayed = v.current.some((p) => p.seat === v.contract.bidder);
    if (!bidderPlayed) return v.current[0].seat === v.contract.bidder ? "?" : "partner led, bidder last";
    const w = currentWinner(v)!;
    if (v.current.length === 1) return "bidder led, I'm 2nd";
    return w.seat === v.contract.bidder ? "3rd, bidder winning" : "3rd, partner winning";
  };
  return {
    name: "misere-def-follow",
    describe: "Misère; I'm a defender following suit with a choice of cards.",
    key: (v) => `${v.seat}${misBand(v)}${where(v)}`,
    match(v) {
      if (!ok(v)) return null;
      const u = unseenCards(v);
      const myBottom = plain(v.legal).some((c) => isBottom(v, c, u));
      return `${where(v)}, ${under(v).length ? "can go under" : "can't go under"}, ${myBottom ? "hold the bottom" : "no bottom"}, ${misTrick(v)}`;
    },
    options: [
      { name: "lowest", choose: (v) => (ok(v) ? lo(plain(v.legal)) : null) },
      { name: "highest under the winner", choose: (v) => (ok(v) ? hi(under(v)) : null) },
      { name: "highest", choose: (v) => (ok(v) ? hi(plain(v.legal)) : null) },
      { name: "second lowest", choose: (v) => { if (!ok(v)) return null; const cs = plain(v.legal).sort((a, b) => rk(a) - rk(b)); return cs[1] ?? null; } },
    ],
  };
}

function misereDiscard(): Situation {
  const ok = (v: PlayView) => isMisDef(v) && v.current.length > 0 && v.ledSuit !== null
    && !v.legal.some((c) => !isJoker(c) && suitOf(c) === v.ledSuit) && plain(v.legal).length >= 2;
  const where = (v: PlayView) => {
    if (!v.current.some((p) => p.seat === v.contract.bidder)) return "bidder yet to play";
    return currentWinner(v)!.seat === v.contract.bidder ? "bidder winning" : "partner winning";
  };
  return {
    name: "misere-def-discard",
    describe: "Misère; I'm a defender void in the led suit.",
    key: (v) => `${v.seat}${misBand(v)}`,
    match(v) {
      if (!ok(v)) return null;
      return `${where(v)}, ${bottomLive(v, v.hand) ? "hold a live bottom" : "no live bottom"}, ${misTrick(v)}`;
    },
    options: [
      { name: "lowest", choose: (v) => (ok(v) ? lo(plain(v.legal)) : null) },
      { name: "highest", choose: (v) => (ok(v) ? hi(plain(v.legal)) : null) },
      {
        name: "highest, keeping live bottoms",
        choose: (v) => {
          if (!ok(v)) return null;
          const u = unseenCards(v); const live = liveSuits(v);
          return hi(plain(v.legal).filter((c) => !(live.includes(suitOf(c)) && isBottom(v, c, u))));
        },
      },
      {
        name: "highest of a suit the bidder is out of",
        choose: (v) => { if (!ok(v)) return null; const live = liveSuits(v); return hi(plain(v.legal).filter((c) => !live.includes(suitOf(c)))); },
      },
    ],
  };
}

// --- 12. Misère: the bidder's own play ----------------------------------------------

const isMisBidder = (v: PlayView) => v.contract.misere && v.seat === v.contract.bidder;
/** Unseen cards below `c` in its suit: how many cards could still be played under it. */
const belowCount = (v: PlayView, c: Card, unseen = unseenCards(v)) =>
  isJoker(c) ? 0 : unseen.filter((x) => !isJoker(x) && suitOf(x) === suitOf(c) && rankOf(x) < rankOf(c)).length;
/** Most dangerous card: fewest unseen cards below it, then highest. */
const mostDangerous = (v: PlayView, cards: Card[]) => {
  const u = unseenCards(v);
  const cs = plain(cards);
  return cs.length ? cs.reduce((a, b) => { const da = belowCount(v, a, u), db = belowCount(v, b, u); return db < da || (db === da && rk(b) > rk(a)) ? b : a; }) : null;
};
const misPos = (v: PlayView) => v.current.length === 0 ? "lead" : v.current.length === 1 ? "2nd" : "last";

function misereBidderLead(): Situation {
  const ok = (v: PlayView) => isMisBidder(v) && v.current.length === 0 && plain(v.legal).length >= 2;
  const bySuit = (v: PlayView) => {
    const m = new Map<Suit, Card[]>();
    for (const c of plain(v.legal)) m.set(suitOf(c), [...(m.get(suitOf(c)) ?? []), c]);
    return m;
  };
  return {
    name: "misere-bidder-lead",
    describe: "Misère; I'm the bidder, on lead.",
    key: (v) => misBand(v),
    match(v) {
      if (!ok(v)) return null;
      const u = unseenCards(v);
      const risky = plain(v.hand).some((c) => belowCount(v, c, u) === 0);
      const safe = plain(v.legal).some((c) => belowCount(v, c, u) >= 2);
      return `${v.exposed ? "open" : "closed"}, ${risky ? "hold a card with nothing below" : "no bare card"}, ${safe ? "have a safe lead" : "no safe lead"}, ${misTrick(v)}`;
    },
    options: [
      { name: "lowest card", choose: (v) => (ok(v) ? lo(plain(v.legal)) : null) },
      {
        name: "safest: most unseen cards below",
        choose: (v) => { if (!ok(v)) return null; const u = unseenCards(v); return plain(v.legal).reduce((a, b) => (belowCount(v, b, u) > belowCount(v, a, u) ? b : a)); },
      },
      {
        name: "unblock: highest card with 2+ unseen below",
        choose: (v) => { if (!ok(v)) return null; const u = unseenCards(v); return hi(plain(v.legal).filter((c) => belowCount(v, c, u) >= 2)); },
      },
      {
        name: "unblock: highest card with 3+ unseen below",
        choose: (v) => { if (!ok(v)) return null; const u = unseenCards(v); return hi(plain(v.legal).filter((c) => belowCount(v, c, u) >= 3)); },
      },
      { name: "low in shortest suit", choose: (v) => { if (!ok(v)) return null; const m = bySuit(v); const su = [...m.keys()].reduce((a, b) => (m.get(b)!.length < m.get(a)!.length ? b : a)); return lo(m.get(su)!); } },
      { name: "low in longest suit", choose: (v) => { if (!ok(v)) return null; const m = bySuit(v); const su = [...m.keys()].reduce((a, b) => (m.get(b)!.length > m.get(a)!.length ? b : a)); return lo(m.get(su)!); } },
    ],
  };
}

function misereBidderFollow(): Situation {
  const under = (v: PlayView) => { const w = currentWinner(v)!; return plain(v.legal).filter((c) => cardPower(c, v.ledSuit!, null) < w.power); };
  const ok = (v: PlayView) => isMisBidder(v) && v.current.length > 0 && v.ledSuit !== null
    && v.legal.some((c) => !isJoker(c) && suitOf(c) === v.ledSuit) && under(v).length >= 2;
  return {
    name: "misere-bidder-follow",
    describe: "Misère; I'm the bidder following suit, with 2+ cards that go under the winning card.",
    key: (v) => misBand(v) + misPos(v),
    match(v) {
      if (!ok(v)) return null;
      const over = plain(v.legal).length > under(v).length ? "also hold cards above" : "all my cards go under";
      return `${misPos(v)}, ${over}, ${misTrick(v)}`;
    },
    options: [
      { name: "highest under", choose: (v) => (ok(v) ? hi(under(v)) : null) },
      { name: "lowest", choose: (v) => (ok(v) ? lo(under(v)) : null) },
      { name: "second highest under", choose: (v) => { if (!ok(v)) return null; const cs = under(v).sort((a, b) => rk(b) - rk(a)); return cs[1] ?? null; } },
    ],
  };
}

function misereBidderDiscard(): Situation {
  const ok = (v: PlayView) => isMisBidder(v) && v.current.length > 0 && v.ledSuit !== null
    && !v.legal.some((c) => !isJoker(c) && suitOf(c) === v.ledSuit) && new Set(plain(v.legal)).size >= 2;
  return {
    name: "misere-bidder-discard",
    describe: "Misère; I'm the bidder, void in the led suit.",
    key: (v) => misBand(v) + misPos(v),
    match(v) {
      if (!ok(v)) return null;
      const u = unseenCards(v);
      const bare = plain(v.hand).some((c) => belowCount(v, c, u) === 0);
      return `${misPos(v)}, ${bare ? "hold a card with nothing below" : "no bare card"}, ${misTrick(v)}`;
    },
    options: [
      { name: "highest", choose: (v) => (ok(v) ? hi(plain(v.legal)) : null) },
      { name: "most dangerous (fewest below)", choose: (v) => (ok(v) ? mostDangerous(v, v.legal) : null) },
      {
        name: "highest of shortest suit",
        choose: (v) => {
          if (!ok(v)) return null;
          const cs = plain(v.legal);
          const n = (su: Suit) => cs.filter((c) => suitOf(c) === su).length;
          const su = SUITS.filter((x) => n(x) > 0).reduce((a, b) => (n(b) < n(a) ? b : a));
          return hi(cs.filter((c) => suitOf(c) === su));
        },
      },
      { name: "lowest", choose: (v) => (ok(v) ? lo(plain(v.legal)) : null) },
    ],
  };
}

// --- 13. The bidder's trump drawing, and the bidder's partner's Joker ------------------

const allTrumps = (v: PlayView) => trumpsIn(v.hand, v.contract.trump!); // includes the Joker
const byPower = (v: PlayView, cs: Card[]) => cs.slice().sort((a, b) => power(b, v.contract.trump!, v.contract.trump) - power(a, v.contract.trump!, v.contract.trump));

function bidderDrawOrder(): Situation {
  const ok = (v: PlayView) => {
    const trump = suitContract(v);
    if (trump === null || v.seat !== v.contract.bidder || v.current.length > 0) return false;
    const mine = allTrumps(v);
    const out = trumpsIn(unseenCards(v), trump).length;
    return mine.length >= 3 && out >= 2 && v.hand.some((c) => !isTrump(c, trump));
  };
  return {
    name: "bidder-draw-order",
    describe: "Bidder on lead with 3+ trumps (Joker counts), 2+ trumps out, and side cards.",
    match(v) {
      if (!ok(v)) return null;
      const trump = v.contract.trump!;
      const u = unseenCards(v);
      const mine = allTrumps(v);
      const out = trumpsIn(u, trump).length;
      const top = byPower(v, mine)[0];
      const bossTop = isBoss(top, v, u);
      const bosses = mine.filter((c) => isBoss(c, v, u) || isJoker(c)).length;
      return `out ${out >= 4 ? "4+" : out}, mine ${mine.length >= 5 ? "5+" : mine.length}, ${bossTop ? `boss trumps ${bosses >= 2 ? "2+" : 1}` : "no boss trump"}, ${trick3(v)}`;
    },
    options: [
      { name: "top trump", choose: (v) => (ok(v) ? byPower(v, allTrumps(v))[0] : null) },
      { name: "low trump", choose: (v) => (ok(v) ? byPower(v, allTrumps(v)).at(-1)! : null) },
      { name: "second-highest trump", choose: (v) => (ok(v) ? byPower(v, allTrumps(v))[1] : null) },
      {
        name: "top non-Joker trump",
        choose: (v) => { if (!ok(v) || !v.hand.includes("JK")) return null; return byPower(v, nonJokerTrumps(v))[0] ?? null; },
      },
      { name: "side boss or low longest", choose: (v) => (ok(v) ? sideBossOrLow(v) : null) },
    ],
  };
}

function partnerJokerOnTrumpLead(): Situation {
  const ok = (v: PlayView) => {
    const trump = suitContract(v);
    if (trump === null || v.ledSuit !== trump || v.current.length === 0 || v.current[0].seat !== v.contract.bidder) return false;
    return v.seat === (v.contract.bidder + 2) % 4 && v.hand.includes("JK") && nonJokerTrumps(v).length > 0;
  };
  return {
    name: "partner-joker-on-trump-lead",
    describe: "The bidder leads a trump; I'm the bidder's partner holding the Joker and another trump.",
    match(v) {
      if (!ok(v)) return null;
      const w = currentWinner(v)!;
      const bidderWinning = w.seat === v.contract.bidder;
      const lead = ledLabel(v.current[0].card, v.contract.trump!);
      return `${lead}, ${bidderWinning ? (isBoss(w.card, v) ? "bidder winning with boss" : "bidder winning, not boss") : "opponent winning"}, ${trick3(v)}`;
    },
    options: [
      { name: "low trump", choose: (v) => (ok(v) ? lowest(nonJokerTrumps(v), v.contract.trump!, v.contract.trump) : null) },
      { name: "Joker", choose: (v) => (ok(v) ? "JK" : null) },
      {
        name: "cheapest winning non-Joker",
        choose: (v) => {
          if (!ok(v)) return null;
          const w = currentWinner(v)!;
          return lowest(nonJokerTrumps(v).filter((c) => power(c, v.ledSuit!, v.contract.trump) > w.power), v.contract.trump!, v.contract.trump);
        },
      },
    ],
  };
}

function partnerJokerLead(): Situation {
  const ok = (v: PlayView) => {
    const trump = suitContract(v);
    return trump !== null && v.current.length === 0 && v.seat === (v.contract.bidder + 2) % 4
      && v.hand.includes("JK") && v.hand.some((c) => !isJoker(c) && !isTrump(c, trump));
  };
  return {
    name: "partner-joker-lead",
    describe: "Trump contract; I'm the bidder's partner on lead holding the Joker and side cards.",
    match(v) {
      if (!ok(v)) return null;
      const out = trumpsIn(unseenCards(v), v.contract.trump!).length;
      return `trumps out ${out >= 3 ? "3+" : out}, other trumps ${Math.min(nonJokerTrumps(v).length, 2)}${nonJokerTrumps(v).length >= 2 ? "+" : ""}, ${trick3(v)}, ${band(bidderNeeds(v))}`;
    },
    options: [
      { name: "side boss or low longest", choose: (v) => (ok(v) ? sideBossOrLow(v) : null) },
      { name: "Joker", choose: (v) => (ok(v) ? "JK" : null) },
      { name: "low trump", choose: (v) => (ok(v) ? lowest(nonJokerTrumps(v), v.contract.trump!, v.contract.trump) : null) },
      { name: "low shortest side", choose: (v) => (ok(v) ? lowShortestSide(v) : null) },
    ],
  };
}

// --- 14. The bidder's trump drawing later in the hand (1-3 trumps out) ----------

function bidderLateDraw(): Situation {
  const ok = (v: PlayView) => {
    const trump = suitContract(v);
    if (trump === null || v.seat !== v.contract.bidder || v.current.length > 0 || v.tricks.length < 1) return false;
    const out = trumpsIn(unseenCards(v), trump).length;
    return allTrumps(v).length >= 1 && out >= 1 && out <= 3 && v.hand.some((c) => !isJoker(c) && !isTrump(c, trump));
  };
  return {
    name: "bidder-late-draw",
    describe: "Bidder on lead after trick 1 with trumps and side cards; 1-3 trumps out.",
    key(v) { return ok(v) ? `:${trumpsIn(unseenCards(v), v.contract.trump!).length}` : ""; },
    match(v) {
      if (!ok(v)) return null;
      const trump = v.contract.trump!;
      const u = unseenCards(v);
      const mine = allTrumps(v);
      const out = trumpsIn(u, trump).length;
      const top = byPower(v, mine)[0];
      const bossTop = isJoker(top) || isBoss(top, v, u);
      const sideWin = v.hand.some((c) => !isJoker(c) && !isTrump(c, trump) && isBoss(c, v, u));
      return `out ${out}, mine ${mine.length >= 3 ? "3+" : mine.length}, ${bossTop ? "boss trump" : "no boss trump"}, ${sideWin ? "side winner" : "no side winner"}`;
    },
    options: [
      { name: "top trump", choose: (v) => (ok(v) ? byPower(v, allTrumps(v))[0] : null) },
      { name: "low trump", choose: (v) => (ok(v) && allTrumps(v).length >= 2 ? byPower(v, allTrumps(v)).at(-1)! : null) },
      { name: "side boss or low longest", choose: (v) => (ok(v) ? sideBossOrLow(v) : null) },
      { name: "low shortest side", choose: (v) => (ok(v) ? lowShortestSide(v) : null) },
    ],
  };
}

// --- 15. The defenders' first lead of the hand --------------------------------

function defFirstLead(): Situation {
  const ok = (v: PlayView) => {
    const trump = suitContract(v);
    if (trump === null || v.current.length > 0 || teamOf(v.seat) === teamOf(v.contract.bidder)) return false;
    if (v.tricks.some((t) => teamOf(t.leader) !== teamOf(v.contract.bidder))) return false;
    return v.hand.some((c) => !isJoker(c) && !isTrump(c, trump));
  };
  const side = (v: PlayView) => v.hand.filter((c) => !isJoker(c) && !isTrump(c, v.contract.trump!));
  const suitCards = (v: PlayView, su: Suit) => side(v).filter((c) => effectiveSuit(c, v.contract.trump!) === su);
  const sideBoss = (v: PlayView) => { const u = unseenCards(v); return side(v).find((c) => isBoss(c, v, u)) ?? null; };
  const partnerSuit = (v: PlayView): Suit | null => {
    const partner = (v.seat + 2) % 4;
    const bids = v.auction.filter((e) => e.seat === partner && e.bid?.kind === "suit").map((e) => (e.bid as { strain: string }).strain);
    for (const st of bids.reverse()) if (st !== "NT" && st !== v.contract.trump && suitCards(v, st as Suit).length) return st as Suit;
    return null;
  };
  const shortSuit = (v: PlayView): Suit => {
    const s2 = side(v); const n = (su: Suit) => s2.filter((c) => effectiveSuit(c, v.contract.trump!) === su).length;
    return SUITS.filter((x) => n(x) > 0).reduce((a, b) => (n(b) < n(a) ? b : a));
  };
  const longSuit = (v: PlayView): Suit => {
    const s2 = side(v); const n = (su: Suit) => s2.filter((c) => effectiveSuit(c, v.contract.trump!) === su).length;
    return SUITS.filter((x) => n(x) > 0).reduce((a, b) => (n(b) > n(a) ? b : a));
  };
  return {
    name: "def-first-lead",
    describe: "Trump contract; a defender on lead for the first time in the hand (no earlier trick led by the defence).",
    match(v) {
      if (!ok(v)) return null;
      const trump = v.contract.trump!;
      const tr = allTrumps(v).length;
      const short = suitCards(v, shortSuit(v)).length;
      return `${v.tricks.length + 1 <= 2 ? "trick ≤2" : v.tricks.length + 1 <= 4 ? "trick 3-4" : "trick 5+"}, ${sideBoss(v) ? "side boss" : "no side boss"}, ${short === 1 && tr > 0 ? "singleton + trumps" : "no ruff shape"}, ${partnerSuit(v) ? "partner bid a suit I hold" : "no partner suit"}, ${trumpsIn(unseenCards(v), trump).length >= 3 ? "3+ trumps out" : "≤2 trumps out"}`;
    },
    options: [
      { name: "side boss or low longest", choose: (v) => (ok(v) ? sideBossOrLow(v) : null) },
      { name: "low longest", choose: (v) => (ok(v) ? lowLongestSide(v) : null) },
      { name: "top of longest", choose: (v) => (ok(v) ? highest(suitCards(v, longSuit(v)), longSuit(v), v.contract.trump) : null) },
      { name: "low shortest", choose: (v) => (ok(v) ? lowShortestSide(v) : null) },
      { name: "top of shortest", choose: (v) => (ok(v) ? highest(suitCards(v, shortSuit(v)), shortSuit(v), v.contract.trump) : null) },
      { name: "partner's suit (boss or low)", choose: (v) => {
        if (!ok(v)) return null; const su = partnerSuit(v); if (!su) return null;
        const u = unseenCards(v); const m = suitCards(v, su);
        return m.find((c) => isBoss(c, v, u)) ?? lowest(m, su, v.contract.trump);
      } },
      { name: "low trump", choose: (v) => (ok(v) && nonJokerTrumps(v).length ? lowest(nonJokerTrumps(v), v.contract.trump!, v.contract.trump) : null) },
    ],
  };
}

export const SITUATIONS: Situation[] = [
  voidLead("bidder"),
  voidLead("partner"),
  bidderVoidSecond(),
  bidderLastTrumps(),
  secondHandBoss(),
  partnerLead(),
  defenderThird(),
  trumpLeadDiscard("defender"),
  trumpLeadDiscard("partner"),
  ntJokerLead(),
  ntJokerFollow(),
  defJokerOnTrumpLead(),
  defJokerRuff(),
  defJokerLead(),
  defLeadTrump(),
  misereLead(),
  misereFollow(),
  misereDiscard(),
  misereBidderLead(),
  misereBidderFollow(),
  misereBidderDiscard(),
  bidderDrawOrder(),
  partnerJokerOnTrumpLead(),
  partnerJokerLead(),
  bidderLateDraw(),
  defFirstLead(),
];

export { isJoker };
