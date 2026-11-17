// Exact ("double-dummy") solver for the last few tricks of a fully known deal.
// Used inside simulations, where every hand is known in the sampled world.
// Returns the final hand score difference (team 0 points − team 1 points)
// with best play by both sides, so it handles contract, slam and misère
// scoring exactly.
import { Card, Suit, SUITS, isJoker } from "../cards.ts";
import { PlayState } from "../game.ts";
import { activeSeats, cardPower, effectiveSuit, legalPlays, scoreHand, teamOf, trickWinnerIndex } from "../rules.ts";

export interface SolveStats {
  nodes: number;
}

export function solveEndgame(s: PlayState, stats: SolveStats = { nodes: 0 }): number {
  if (s.current.length !== 0) throw new Error("solveEndgame must start at a trick boundary");
  const { contract, rules } = s;
  const trump = contract.trump;
  const seats = activeSeats(contract);
  const nextSeat = (x: number) => {
    let n = (x + 1) % 4;
    while (!seats.includes(n)) n = (n + 1) % 4;
    return n;
  };
  const hands = s.hands.map((h) => h.slice());
  const leaf = (t0: number, t1: number) => {
    const p = scoreHand(contract, [t0, t1], rules).points;
    return p[0] - p[1];
  };

  /** Legal moves with equivalent cards (adjacent in rank, nothing in play between) removed. */
  function moves(seat: number, ledSuit: Suit | null, current: { seat: number; card: Card }[]): { card: Card; joker?: Suit }[] {
    const legal = legalPlays(hands[seat], ledSuit, trump);
    const out: { card: Card; joker?: Suit }[] = [];
    const bySuit = new Map<string, Card[]>();
    for (const c of legal) {
      if (isJoker(c) && trump === null) {
        if (ledSuit === null) for (const su of SUITS) out.push({ card: c, joker: su });
        else out.push({ card: c });
        continue;
      }
      const k = effectiveSuit(c, trump)!;
      if (!bySuit.has(k)) bySuit.set(k, []);
      bySuit.get(k)!.push(c);
    }
    for (const [suit, cards] of bySuit) {
      const su = suit as Suit;
      const pw = (c: Card) => cardPower(c, su, trump);
      cards.sort((a, b) => pw(b) - pw(a));
      // Powers of other cards still live in this suit.
      const others: number[] = [];
      for (let x = 0; x < 4; x++) {
        if (x === seat) continue;
        for (const c of hands[x]) if (!(isJoker(c) && trump === null) && effectiveSuit(c, trump) === su) others.push(pw(c));
      }
      for (const p of current) if (!(isJoker(p.card) && trump === null) && effectiveSuit(p.card, trump) === su) others.push(pw(p.card));
      let prev: number | null = null;
      for (const c of cards) {
        const v = pw(c);
        if (prev !== null && !others.some((o) => o < prev! && o > v)) { prev = v; continue; } // equivalent to the card above
        out.push({ card: c });
        prev = v;
      }
    }
    return out;
  }

  function rec(
    leader: number, current: { seat: number; card: Card }[], ledSuit: Suit | null,
    trick: number, t0: number, t1: number, alpha: number, beta: number,
  ): number {
    stats.nodes++;
    if (current.length === seats.length) {
      const w = current[trickWinnerIndex(current, ledSuit!, trump)].seat;
      const n0 = t0 + (teamOf(w) === 0 ? 1 : 0);
      const n1 = t1 + (teamOf(w) === 1 ? 1 : 0);
      if (trick + 1 === 10) return leaf(n0, n1);
      return rec(w, [], null, trick + 1, n0, n1, alpha, beta);
    }
    let seat = leader;
    for (let i = 0; i < current.length; i++) seat = nextSeat(seat);
    const maximizing = teamOf(seat) === 0;
    let best = maximizing ? -Infinity : Infinity;
    for (const m of moves(seat, ledSuit, current)) {
      const hand = hands[seat];
      const idx = hand.indexOf(m.card);
      hand.splice(idx, 1);
      const led = ledSuit ?? (m.joker ?? (effectiveSuit(m.card, trump) as Suit));
      current.push({ seat, card: m.card });
      const v = rec(leader, current, led, trick, t0, t1, alpha, beta);
      current.pop();
      hand.splice(idx, 0, m.card);
      if (maximizing) {
        if (v > best) best = v;
        if (best > alpha) alpha = best;
      } else {
        if (v < best) best = v;
        if (best < beta) beta = best;
      }
      if (alpha >= beta) break;
    }
    return best;
  }

  return rec(s.leader, [], null, s.tricks.length, s.teamTricks[0], s.teamTricks[1], -Infinity, Infinity);
}
