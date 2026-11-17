// Helpers shared by strategies: card tracking and simple card judgements.
import { Card, Suit, SUITS, isJoker, makeDeck, rankOf, suitOf } from "../cards.ts";
import { cardPower, effectiveSuit, isTrump, teamOf } from "../rules.ts";
import { PlayView } from "../player.ts";

const DECK = makeDeck();

/** Cards this player has not seen: not in hand, not played, not discarded/exposed. */
export function unseenCards(view: PlayView): Card[] {
  const seen = new Set<Card>(view.hand);
  for (const t of view.tricks) for (const p of t.plays) seen.add(p.card);
  for (const p of view.current) seen.add(p.card);
  for (const c of view.discarded ?? []) seen.add(c);
  for (const c of view.exposed ?? []) seen.add(c);
  return DECK.filter((c) => !seen.has(c));
}

/** True if no unseen card can beat `card` in its own suit (ignores ruffs). */
export function isBoss(card: Card, view: PlayView, unseen = unseenCards(view)): boolean {
  const trump = view.contract.trump;
  if (isJoker(card)) return true;
  const suit = effectiveSuit(card, trump)!;
  const mine = cardPower(card, suit, trump);
  return !unseen.some((c) => {
    if (trump === null && isJoker(c)) return false; // NT Joker only wins when void; ignore
    return effectiveSuit(c, trump) === suit && cardPower(c, suit, trump) > mine;
  });
}

/** The play currently winning the trick, if any. */
export function currentWinner(view: PlayView) {
  if (view.current.length === 0 || view.ledSuit === null) return null;
  let best = view.current[0];
  let bestPower = cardPower(best.card, view.ledSuit, view.contract.trump);
  for (const p of view.current) {
    const pw = cardPower(p.card, view.ledSuit, view.contract.trump);
    if (pw > bestPower) {
      best = p;
      bestPower = pw;
    }
  }
  return { ...best, power: bestPower };
}

export function partnerOf(seat: number): number {
  return (seat + 2) % 4;
}

export function sameTeam(a: number, b: number): boolean {
  return teamOf(a) === teamOf(b);
}

/** How costly a card is to throw away (low = happy to discard). */
export function keepValue(card: Card, trump: Suit | null): number {
  if (isJoker(card)) return 200;
  if (trump !== null && isTrump(card, trump)) return 100 + cardPower(card, trump, trump);
  return rankOf(card);
}

export function cheapest(cards: Card[], trump: Suit | null): Card {
  return cards.reduce((a, b) => (keepValue(b, trump) < keepValue(a, trump) ? b : a));
}

export function dearest(cards: Card[], trump: Suit | null): Card {
  return cards.reduce((a, b) => (keepValue(b, trump) > keepValue(a, trump) ? b : a));
}

/** Cards of a printed suit, excluding the Joker and (with trumps) the Left Bower. */
export function sideSuitCards(hand: Card[], suit: Suit, trump: Suit | null): Card[] {
  return hand.filter((c) => !isJoker(c) && effectiveSuit(c, trump) === suit);
}

export function suitCounts(hand: Card[], trump: Suit | null): Record<Suit, number> {
  const out = { S: 0, C: 0, D: 0, H: 0 } as Record<Suit, number>;
  for (const s of SUITS) out[s] = sideSuitCards(hand, s, trump).length;
  return out;
}

export { suitOf, rankOf, isJoker, cardPower, effectiveSuit, isTrump };
