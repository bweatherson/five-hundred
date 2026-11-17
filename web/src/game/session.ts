// A session is what the screen talks to: the table it should draw, the seat it is
// drawing for, and a way to act. The host (or a solo player) runs the real table
// and the computer players; a guest only holds the latest picture sent by the host.
import { Card, Suit } from "../../../src/cards.ts";
import { BidAction } from "../../../src/rules.ts";
import { Table } from "./table.ts";

export type Action =
  | { type: "bid"; bid: BidAction }
  | { type: "discard"; cards: Card[] }
  | { type: "play"; card: Card; suit?: Suit }
  | { type: "ready" };

export interface Session {
  role: "solo" | "host" | "guest";
  /** The seat this screen belongs to. */
  me: number;
  table(): Table;
  act(a: Action): void;
  subscribe(fn: () => void): () => void;
  /** Set when the connection to the other players has a problem. */
  status?: string;
  close(): void;
}

export function applyAction(t: Table, seat: number, a: Action) {
  if (a.type === "bid") t.bid(seat, a.bid);
  else if (a.type === "discard") { if (t.contract?.bidder === seat) t.discard(a.cards); }
  else if (a.type === "play") t.playCard(seat, a.card, a.suit);
  else if (a.type === "ready") t.markReady(seat);
}

// How long the table pauses before each computer move, and between tricks.
export const PACE = { bid: 750, discard: 1100, play: 620, showTrick: 1050, collect: 420, redeal: 1900 };

/** Runs a real table: the computer players, the pacing, and anyone's moves. */
export class HostSession implements Session {
  role: "solo" | "host";
  me = 0;
  status?: string;
  private listeners = new Set<() => void>();
  private timer: number | undefined;
  /** Called after every change (the network layer uses it to send the table out). */
  onChange?: () => void;

  constructor(public t: Table, role: "solo" | "host" = "solo") {
    this.role = role;
    this.schedule();
  }

  table() { return this.t; }
  act(a: Action) { this.apply(this.me, a); }

  apply(seat: number, a: Action) {
    try {
      applyAction(this.t, seat, a);
    } catch (e) {
      console.warn("Ignored move", seat, a, e);
    }
    this.changed();
  }

  changed() {
    this.listeners.forEach((f) => f());
    this.onChange?.();
    this.schedule();
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  newGame() {
    this.t.newGame();
    this.changed();
  }

  close() { window.clearTimeout(this.timer); this.listeners.clear(); }

  private schedule() {
    window.clearTimeout(this.timer);
    const t = this.t;
    const after = (ms: number, f: () => void) => {
      this.timer = window.setTimeout(() => { f(); this.changed(); }, ms);
    };
    const actor = t.actor();
    if ((t.phase === "auction" || t.phase === "discard" || t.phase === "play") && actor !== null && !t.humans[actor]) {
      const ms = t.phase === "auction" ? PACE.bid : t.phase === "discard" ? PACE.discard : PACE.play;
      after(ms, () => t.aiStep());
    } else if (t.phase === "trickEnd") {
      if (!t.collecting) after(PACE.showTrick, () => { t.collecting = true; });
      else after(PACE.collect, () => { t.collecting = false; t.collectTrick(); });
    } else if (t.phase === "redeal") {
      after(PACE.redeal, () => t.redeal());
    }
  }
}
