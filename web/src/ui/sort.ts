import { Card, Suit, colourOf, isJoker, rankOf } from "../../../src/cards.ts";
import { cardPower, effectiveSuit } from "../../../src/rules.ts";

/**
 * Order a hand for display: suits alternate colour, the trump suit (with both
 * bowers and the Joker) goes on the right, and cards run high to low.
 */
export function sortHand(cards: Card[], trump: Suit | null): Card[] {
  let order: Suit[] = ["S", "H", "C", "D"];
  if (trump) {
    const others = order.filter((s) => s !== trump);
    const same = others.filter((s) => colourOf(s) === colourOf(trump));
    const diff = others.filter((s) => colourOf(s) !== colourOf(trump));
    order = [diff[0], ...same, diff[1], trump];
  }
  const group = (c: Card) => (isJoker(c) ? (trump ? order.indexOf(trump) : 4) : order.indexOf(effectiveSuit(c, trump) as Suit));
  const power = (c: Card) =>
    isJoker(c) ? 100 : trump && effectiveSuit(c, trump) === trump ? cardPower(c, trump, trump) : rankOf(c);
  return cards.slice().sort((a, b) => group(a) - group(b) || power(b) - power(a));
}
