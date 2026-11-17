// Deal the cards a player cannot see into plausible hands for the other
// players ("determinization"), respecting what play so far has revealed.
import { Card, Suit } from "../cards.ts";
import { effectiveSuit } from "../rules.ts";
import { PlayView } from "../player.ts";
import { Rng, shuffle } from "../rng.ts";
import { unseenCards } from "./util.ts";

/** Suits each seat has shown out of (failed to follow). */
export function knownVoids(view: PlayView): Set<Suit>[] {
  const voids = [0, 1, 2, 3].map(() => new Set<Suit>());
  const trump = view.contract.trump;
  const tricks = [...view.tricks, ...(view.current.length ? [{ plays: view.current, ledSuit: view.ledSuit! }] : [])];
  for (const t of tricks) {
    t.plays.forEach((p, i) => {
      if (i > 0 && effectiveSuit(p.card, trump) !== t.ledSuit) voids[p.seat].add(t.ledSuit);
    });
  }
  return voids;
}

/** How many cards each seat still holds (0 for a seat sitting out). */
export function handSizes(view: PlayView): number[] {
  return [0, 1, 2, 3].map((s) => {
    if (!view.activeSeats.includes(s)) return 0;
    return 10 - view.tricks.length - (view.current.some((p) => p.seat === s) ? 1 : 0);
  });
}

export interface World {
  hands: Card[][];
  /** The bidder's discards (sampled if this player is not the bidder). */
  discarded: Card[];
}

export function sampleWorld(view: PlayView, rng: Rng, respectVoids = true, attempts = 30): World {
  const sizes = handSizes(view);
  const bidder = view.contract.bidder;
  const trump = view.contract.trump;
  const hands: Card[][] = [[], [], [], []];
  hands[view.seat] = view.hand.slice();
  const fixed = new Set<number>([view.seat]);
  if (view.exposed) {
    hands[bidder] = view.exposed.slice();
    fixed.add(bidder);
  }
  const toFill = [0, 1, 2, 3].filter((s) => !fixed.has(s) && sizes[s] > 0);
  const pool = unseenCards(view);
  const voids = knownVoids(view);
  const allowed = (c: Card, s: number) => !voids[s].has(effectiveSuit(c, trump) as Suit);

  for (let a = 0; a <= attempts; a++) {
    const useVoids = respectVoids && a < attempts;
    let remaining = shuffle(pool, rng);
    const order = toFill.slice().sort((x, y) =>
      useVoids ? remaining.filter((c) => allowed(c, x)).length - remaining.filter((c) => allowed(c, y)).length : 0);
    const out = hands.map((h) => h.slice());
    let ok = true;
    for (const s of order) {
      const take: Card[] = [];
      const rest: Card[] = [];
      for (const c of remaining) {
        if (take.length < sizes[s] && (!useVoids || allowed(c, s))) take.push(c);
        else rest.push(c);
      }
      if (take.length < sizes[s]) { ok = false; break; }
      out[s] = take;
      remaining = rest;
    }
    if (!ok) continue;
    const discarded = view.discarded ? view.discarded.slice() : remaining.slice(0, 3);
    return { hands: out, discarded };
  }
  throw new Error("unreachable: unconstrained sampling cannot fail");
}
