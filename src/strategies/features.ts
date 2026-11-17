// Hand features for a fitted trick estimate. Each strain has a feature vector
// computed from the 10-card hand at bidding time; the estimate is a linear
// combination fitted (src/calibrate.ts) to the tricks the declaring side
// actually took when this hand was made to declare that strain.
import { Card, Suit, SUITS } from "../cards.ts";
import { Strain, cardPower, isTrump } from "../rules.ts";
import { sideSuitCards } from "./util.ts";

const LEFT: Record<Suit, Suit> = { S: "C", C: "S", D: "H", H: "D" };

export const SUIT_FEATURES = [
  "const", "JK", "right", "left", "A", "K", "Q", "trumps", "trumps>4", "trumps>6",
  "sideA", "sideK+A", "sideKx", "sideK", "sideQ+AK", "voids", "singletons", "voids*4T", "singles*4T",
  "sideLength>4", "ladder",
] as const;

export const NT_FEATURES = [
  "const", "JK", "A", "K+A", "Kx", "K", "Q+AK", "Qxx", "J+AKQ", "unstopped", "length>4 with A",
  "length>4", "voids",
] as const;

/** Trump-ladder score from the original hand-picked estimate (kept as one feature). */
export function ladderScore(hand: Card[], trump: Suit): number {
  const trumps = hand.filter((c) => isTrump(c, trump)).sort((a, b) => cardPower(b, trump, trump) - cardPower(a, trump, trump));
  const ladder = ["JK", "J" + trump, "J" + LEFT[trump]];
  for (const r of ["A", "K", "Q", "T", "9", "8", "7", "6", "5", "4"]) ladder.push(r + trump);
  let tricks = 0;
  trumps.forEach((c, i) => {
    const missingAbove = ladder.slice(0, ladder.indexOf(c)).filter((x) => !hand.includes(x)).length;
    if (missingAbove <= i) tricks += 1;
    else if (missingAbove === i + 1) tricks += 0.5;
    else if (i >= 3) tricks += 0.5;
    else tricks += 0.1;
  });
  return tricks;
}

export function suitFeatures(hand: Card[], trump: Suit): number[] {
  const has = (c: string) => (hand.includes(c) ? 1 : 0);
  const n = hand.filter((c) => isTrump(c, trump)).length;
  let sideA = 0, sideKA = 0, sideKx = 0, sideK = 0, sideQ = 0, voids = 0, singles = 0, long = 0;
  for (const s of SUITS) {
    if (s === trump) continue;
    const cards = sideSuitCards(hand, s, trump);
    const h = (r: string) => cards.includes(r + s);
    if (h("A")) sideA++;
    if (h("K")) {
      if (h("A")) sideKA++;
      else if (cards.length >= 2) sideKx++;
      else sideK++;
    }
    if (h("Q") && (h("A") || h("K"))) sideQ++;
    if (cards.length === 0) voids++;
    if (cards.length === 1 && !h("A")) singles++;
    long += Math.max(0, cards.length - 4);
  }
  const four = n >= 4 ? 1 : 0;
  return [
    1, has("JK"), has("J" + trump), has("J" + LEFT[trump]), has("A" + trump), has("K" + trump), has("Q" + trump),
    n, Math.max(0, n - 4), Math.max(0, n - 6),
    sideA, sideKA, sideKx, sideK, sideQ, voids, singles, voids * four, singles * four,
    long, ladderScore(hand, trump),
  ];
}

export function ntFeatures(hand: Card[]): number[] {
  let A = 0, KA = 0, Kx = 0, K = 0, QAK = 0, Qxx = 0, J = 0, unstopped = 0, longA = 0, long = 0, voids = 0;
  for (const s of SUITS) {
    const cards = sideSuitCards(hand, s, null);
    const h = (r: string) => cards.includes(r + s);
    if (h("A")) A++;
    if (h("K")) {
      if (h("A")) KA++;
      else if (cards.length >= 2) Kx++;
      else K++;
    }
    if (h("Q")) {
      if (h("A") && h("K")) QAK++;
      else if (cards.length >= 3) Qxx++;
    }
    if (h("J") && h("A") && h("K") && h("Q")) J++;
    if (!h("A") && !(h("K") && cards.length >= 2) && !(h("Q") && cards.length >= 3)) unstopped++;
    if (h("A")) longA += Math.max(0, cards.length - 4);
    long += Math.max(0, cards.length - 4);
    if (cards.length === 0) voids++;
  }
  return [1, hand.includes("JK") ? 1 : 0, A, KA, Kx, K, QAK, Qxx, J, unstopped, longA, long, voids];
}

export function strainFeatures(hand: Card[], strain: Strain): number[] {
  return strain === "NT" ? ntFeatures(hand) : suitFeatures(hand, strain);
}

/**
 * Fitted coefficients (src/fit-estimate.ts on 1M forced-contract playouts of tuned3,
 * weighted to hands near the bidding range). The prediction is the declaring
 * side's total tricks, so it includes partner's and the kitty's contribution.
 */
export const SUIT_COEFS = [3.158, 0.752, 0.552, 0.380, 0.206, 0.114, 0.059, 0.516, -0.043, -0.139, 0.522, 0.387, 0.195, 0.060, 0.101, 0.023, 0.014, 0.216, 0.143, 0.049, 0.018];
export const NT_COEFS = [3.677, 1.494, 0.670, 0.659, 0.492, 0.350, 0.523, 0.206, 0.081, 0.205, 0.414, 0.025, -0.007];

/** Fitted prediction of the declaring side's tricks with this hand in this strain. */
export function fittedTricks(hand: Card[], strain: Strain): number {
  const f = strainFeatures(hand, strain);
  const c = strain === "NT" ? NT_COEFS : SUIT_COEFS;
  return f.reduce((s, x, i) => s + x * c[i], 0);
}
