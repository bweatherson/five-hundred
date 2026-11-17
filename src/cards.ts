// Cards are short strings: rank character + suit character, e.g. "AS", "TH", "4D".
// The Joker is "JK". "T" stands for 10.

export type Suit = "S" | "C" | "D" | "H";
export type Card = string;

export const SUITS: Suit[] = ["S", "C", "D", "H"];
export const RANKS = ["4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const;
export const JOKER: Card = "JK";

const RANK_VALUE: Record<string, number> = {
  "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, T: 10, J: 11, Q: 12, K: 13, A: 14,
};

export function isJoker(card: Card): boolean {
  return card === JOKER;
}

/** The printed suit of a card (not adjusted for bowers). Throws for the Joker. */
export function suitOf(card: Card): Suit {
  if (isJoker(card)) throw new Error("The Joker has no printed suit");
  return card[1] as Suit;
}

/** Printed rank as a number, 4..14 (Ace high). Joker is 15. */
export function rankOf(card: Card): number {
  if (isJoker(card)) return 15;
  return RANK_VALUE[card[0]];
}

export function colourOf(suit: Suit): "black" | "red" {
  return suit === "S" || suit === "C" ? "black" : "red";
}

/** The other suit of the same colour (the Left Bower's suit). */
export function sameColourSuit(suit: Suit): Suit {
  return ({ S: "C", C: "S", D: "H", H: "D" } as const)[suit];
}

/** The 43-card deck: A..4 in each suit, without the black 4s, plus the Joker. */
export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      if (r === "4" && colourOf(s) === "black") continue;
      deck.push(r + s);
    }
  }
  deck.push(JOKER);
  return deck;
}

const SUIT_SYMBOL: Record<Suit, string> = { S: "♠", C: "♣", D: "♦", H: "♥" };

export function suitSymbol(suit: Suit): string {
  return SUIT_SYMBOL[suit];
}

export function cardLabel(card: Card): string {
  if (isJoker(card)) return "Joker";
  const r = card[0] === "T" ? "10" : card[0];
  return r + SUIT_SYMBOL[suitOf(card)];
}
