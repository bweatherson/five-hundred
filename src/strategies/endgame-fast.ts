// Faster exact endgame solver: same results as endgame.ts, plus
//  - a transposition table at trick boundaries (with alpha-beta bounds),
//  - move ordering (likely-best cards first, so cutoffs come sooner),
//  - pruning when no outcome of the remaining tricks can change the result,
//  - a direct evaluation of the forced last trick.
import { Card, Suit, SUITS, isJoker } from "../cards.ts";
import { PlayState } from "../game.ts";
import { activeSeats, cardPower, effectiveSuit, legalPlays, scoreHand, teamOf, trickWinnerIndex } from "../rules.ts";
import { SolveStats } from "./endgame.ts";

interface Bound { lo: number; hi: number }

export function solveEndgameFast(s: PlayState, stats: SolveStats = { nodes: 0 }): number {
  if (s.current.length !== 0) throw new Error("solveEndgame must start at a trick boundary");
  const { contract, rules } = s;
  const trump = contract.trump;
  const seats = activeSeats(contract);
  const nSeats = seats.length;
  const next = [0, 1, 2, 3].map((x) => {
    let n = (x + 1) % 4;
    while (!seats.includes(n)) n = (n + 1) % 4;
    return n;
  });
  const hands = s.hands.map((h, i) => (seats.includes(i) ? h.slice() : []));
  const leafCache = new Map<number, number>();
  const leaf = (t0: number, t1: number) => {
    const k = t0 * 16 + t1;
    let v = leafCache.get(k);
    if (v === undefined) {
      const p = scoreHand(contract, [t0, t1], rules).points;
      v = p[0] - p[1];
      leafCache.set(k, v);
    }
    return v;
  };
  const isNTJoker = (c: Card) => trump === null && isJoker(c);
  const suitOfCard = (c: Card) => (isNTJoker(c) ? null : (effectiveSuit(c, trump) as Suit));
  const tt = new Map<string, Bound>();

  function moves(seat: number, ledSuit: Suit | null, current: { seat: number; card: Card }[]): { card: Card; joker?: Suit }[] {
    const legal = legalPlays(hands[seat], ledSuit, trump);
    const out: { card: Card; joker?: Suit; key: number }[] = [];
    const bySuit = new Map<Suit, Card[]>();
    for (const c of legal) {
      const su = suitOfCard(c);
      if (su === null) {
        if (ledSuit === null) for (const j of SUITS) out.push({ card: c, joker: j, key: 1000 });
        else out.push({ card: c, key: 1000 });
        continue;
      }
      if (!bySuit.has(su)) bySuit.set(su, []);
      bySuit.get(su)!.push(c);
    }
    // Current winning power, to order following plays.
    let winPower = -1;
    let partnerWinning = false;
    if (ledSuit !== null && current.length > 0) {
      let wi = 0;
      current.forEach((p, i) => {
        const pw = cardPower(p.card, ledSuit, trump);
        if (pw > winPower) { winPower = pw; wi = i; }
      });
      partnerWinning = teamOf(current[wi].seat) === teamOf(seat);
    }
    for (const [su, cards] of bySuit) {
      const pw = (c: Card) => cardPower(c, su, trump);
      cards.sort((a, b) => pw(b) - pw(a));
      const others: number[] = [];
      for (const x of seats) {
        if (x === seat) continue;
        for (const c of hands[x]) if (suitOfCard(c) === su) others.push(pw(c));
      }
      for (const p of current) if (suitOfCard(p.card) === su) others.push(pw(p.card));
      let prev: number | null = null;
      for (const c of cards) {
        const v = pw(c);
        if (prev !== null && !others.some((o) => o < prev! && o > v)) { prev = v; continue; }
        prev = v;
        let key: number;
        if (ledSuit === null) key = v; // lead high cards first
        else {
          const real = cardPower(c, ledSuit, trump);
          if (!partnerWinning && real > winPower) key = 500 - real; // cheapest winner first
          else key = 200 - real; // otherwise lowest first
        }
        out.push({ card: c, key });
      }
    }
    out.sort((a, b) => b.key - a.key);
    return out;
  }

  function lastTrick(leader: number, t0: number, t1: number): number {
    const plays: { seat: number; card: Card }[] = [];
    let seat = leader;
    for (let i = 0; i < nSeats; i++) { plays.push({ seat, card: hands[seat][0] }); seat = next[seat]; }
    const lead = plays[0].card;
    // A no-trump Joker lead wins whatever suit is named, so any suit will do.
    const led = suitOfCard(lead) ?? "S";
    const w = plays[trickWinnerIndex(plays, led, trump)].seat;
    return teamOf(w) === 0 ? leaf(t0 + 1, t1) : leaf(t0, t1 + 1);
  }

  function key(leader: number, t0: number): string {
    let k = `${leader}${t0}`;
    for (const x of seats) k += "|" + hands[x].slice().sort().join("");
    return k;
  }

  function rec(
    leader: number, current: { seat: number; card: Card }[], ledSuit: Suit | null,
    trick: number, t0: number, t1: number, alpha: number, beta: number,
  ): number {
    stats.nodes++;
    if (current.length === nSeats) {
      const w = current[trickWinnerIndex(current, ledSuit!, trump)].seat;
      const n0 = t0 + (teamOf(w) === 0 ? 1 : 0);
      const n1 = t1 + (teamOf(w) === 1 ? 1 : 0);
      if (trick + 1 === 10) return leaf(n0, n1);
      return rec(w, [], null, trick + 1, n0, n1, alpha, beta);
    }

    let ttKey: string | null = null;
    let entry: Bound | undefined;
    if (current.length === 0) {
      const left = 10 - trick;
      if (left === 1) return lastTrick(leader, t0, t1);
      // Bound pruning: range of possible final values.
      let mn = Infinity, mx = -Infinity;
      for (let k = 0; k <= left; k++) {
        const v = leaf(t0 + k, t1 + left - k);
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      if (mx <= alpha) return mx;
      if (mn >= beta) return mn;
      if (mn === mx) return mn;
      ttKey = key(leader, t0);
      entry = tt.get(ttKey);
      if (entry) {
        if (entry.lo >= beta) return entry.lo;
        if (entry.hi <= alpha) return entry.hi;
        if (entry.lo === entry.hi) return entry.lo;
        if (entry.lo > alpha) alpha = entry.lo;
        if (entry.hi < beta) beta = entry.hi;
      }
    }

    let seat = leader;
    for (let i = 0; i < current.length; i++) seat = next[seat];
    const maximizing = teamOf(seat) === 0;
    let best = maximizing ? -Infinity : Infinity;
    let a = alpha, b = beta;
    for (const m of moves(seat, ledSuit, current)) {
      const hand = hands[seat];
      const idx = hand.indexOf(m.card);
      hand.splice(idx, 1);
      const led = ledSuit ?? (m.joker ?? (effectiveSuit(m.card, trump) as Suit));
      current.push({ seat, card: m.card });
      const v = rec(leader, current, led, trick, t0, t1, a, b);
      current.pop();
      hand.splice(idx, 0, m.card);
      if (maximizing) {
        if (v > best) best = v;
        if (best > a) a = best;
      } else {
        if (v < best) best = v;
        if (best < b) b = best;
      }
      if (a >= b) break;
    }

    if (ttKey !== null) {
      const e: Bound = entry ? { ...entry } : { lo: -Infinity, hi: Infinity };
      if (best <= alpha) e.hi = Math.min(e.hi, best);
      else if (best >= beta) e.lo = Math.max(e.lo, best);
      else { e.lo = best; e.hi = best; }
      tt.set(ttKey, e);
    }
    return best;
  }

  return rec(s.leader, [], null, s.tricks.length, s.teamTricks[0], s.teamTricks[1], -Infinity, Infinity);
}
