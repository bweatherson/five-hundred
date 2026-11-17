// Playing with friends over the internet. One player hosts: their browser runs the
// table and the computer players. The others join with the host's room code and
// get a picture of the table from their own seat after every move.
//
// Browsers find each other through PeerJS's free public broker, then talk
// directly (WebRTC). No server of our own is needed, so this works from any
// static host such as GitHub Pages.
import Peer, { DataConnection } from "peerjs";
import { Action, HostSession, Session } from "../game/session.ts";
import { Table, TableSnapshot } from "../game/table.ts";

const PREFIX = "five-hundred-table-v1-";
// Consonants only, so a code is easy to read out and never spells anything.
const LETTERS = "BCDFGHJKLMNPQRSTVWXZ";

export function makeCode(): string {
  let s = "";
  for (let i = 0; i < 5; i++) s += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  return s;
}

export function cleanCode(s: string) {
  return s.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
}

export interface SeatInfo {
  kind: "host" | "guest" | "computer";
  name: string;
  connected: boolean;
}

type ToGuest =
  | { type: "lobby"; code: string; seats: SeatInfo[]; guests: string[]; you: string }
  | { type: "state"; seat: number; snap: TableSnapshot }
  | { type: "error"; message: string };

type ToHost = { type: "hello"; name: string } | { type: "action"; action: Action };

interface Guest {
  id: string;
  name: string;
  conn: DataConnection;
  connected: boolean;
}

function peerError(e: { type?: string; message?: string }): string {
  switch (e.type) {
    case "peer-unavailable": return "There's no game with that code. Check the code, and that the host still has the game open.";
    case "network":
    case "server-error":
    case "socket-error":
    case "socket-closed": return "Couldn't reach the connection service. Check your internet connection and try again.";
    case "browser-incompatible": return "This browser can't make direct connections to other players.";
    default: return e.message || "Connection problem.";
  }
}

// --- Hosting -----------------------------------------------------------------------

/** The host's side: a room others can join, then the game itself. */
export class HostRoom {
  code = makeCode();
  peer: Peer;
  guests: Guest[] = [];
  /** Who sits where: seat 0 is the host; others hold a guest id or null for the computer. */
  seats: (string | null)[] = ["host", null, null, null];
  session: HostSession | null = null;
  ready = false;
  error: string | null = null;
  private listeners = new Set<() => void>();

  constructor(public hostName: string) {
    this.peer = this.open();
  }

  private open(): Peer {
    const peer = new Peer(PREFIX + this.code);
    peer.on("open", () => { this.ready = true; this.error = null; this.changed(); });
    peer.on("connection", (conn) => this.accept(conn));
    peer.on("error", (e) => {
      if (e.type === "unavailable-id") {
        // Someone else has this code: pick another.
        peer.destroy();
        this.code = makeCode();
        this.peer = this.open();
        return;
      }
      if (e.type === "peer-unavailable") return;
      this.error = peerError(e);
      this.changed();
    });
    peer.on("disconnected", () => {
      // Lost the broker: existing games carry on, but try to stay joinable.
      if (!peer.destroyed) peer.reconnect();
    });
    return peer;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private changed() {
    this.listeners.forEach((f) => f());
    this.broadcast();
  }

  seatInfo(): SeatInfo[] {
    return this.seats.map((id, seat) => {
      if (seat === 0) return { kind: "host", name: this.hostName, connected: true };
      const g = id ? this.guests.find((x) => x.id === id) : undefined;
      if (!g) return { kind: "computer", name: "Computer", connected: true };
      return { kind: "guest", name: g.name, connected: g.connected };
    });
  }

  private accept(conn: DataConnection) {
    conn.on("data", (raw) => {
      const msg = raw as ToHost;
      if (msg.type === "hello") this.hello(conn, msg.name);
      else if (msg.type === "action") {
        const seat = this.seats.indexOf(conn.peer);
        if (seat > 0 && this.session) this.session.apply(seat, msg.action);
      }
    });
    conn.on("close", () => this.lost(conn.peer));
    conn.on("error", () => this.lost(conn.peer));
  }

  private hello(conn: DataConnection, rawName: string) {
    const name = (rawName || "Guest").trim().slice(0, 16) || "Guest";
    // Someone coming back after losing their connection takes their old seat.
    const old = this.guests.find((g) => !g.connected && g.name.toLowerCase() === name.toLowerCase());
    if (old) {
      const seat = this.seats.indexOf(old.id);
      old.id = conn.peer;
      old.conn = conn;
      old.connected = true;
      if (seat > 0) {
        this.seats[seat] = conn.peer;
        if (this.session) this.session.t.humans[seat] = true;
      }
      this.session?.changed();
      this.changed();
      return;
    }
    if (this.session) {
      send(conn, { type: "error", message: "That game has already started." });
      setTimeout(() => conn.close(), 500);
      return;
    }
    if (this.guests.filter((g) => g.connected).length >= 3) {
      send(conn, { type: "error", message: "That table is full." });
      setTimeout(() => conn.close(), 500);
      return;
    }
    let unique = name;
    for (let i = 2; this.guests.some((g) => g.name === unique) || unique === this.hostName; i++) unique = `${name} ${i}`;
    this.guests.push({ id: conn.peer, name: unique, conn, connected: true });
    // Fill your partner's seat first, then the opponents'.
    const free = [2, 1, 3].find((s) => this.seats[s] === null);
    if (free !== undefined) this.seats[free] = conn.peer;
    this.changed();
  }

  private lost(id: string) {
    const g = this.guests.find((x) => x.id === id);
    if (!g || !g.connected) return;
    g.connected = false;
    if (this.session) {
      // The computer plays their seat until they come back.
      const seat = this.seats.indexOf(id);
      if (seat > 0) this.session.t.humans[seat] = false;
      this.session.changed();
    } else {
      // Before the game starts, they simply leave.
      this.guests = this.guests.filter((x) => x !== g);
      this.seats = this.seats.map((s) => (s === id ? null : s));
    }
    this.changed();
  }

  /** Put a guest (or the computer, for null) in a seat; whoever was there moves to theirs. */
  assign(seat: number, id: string | null) {
    if (seat === 0 || this.session) return;
    const from = id ? this.seats.indexOf(id) : -1;
    if (from > 0) this.seats[from] = this.seats[seat];
    this.seats[seat] = id;
    this.changed();
  }

  start() {
    const t = new Table();
    t.humans = this.seats.map((s) => s !== null);
    const info = this.seatInfo();
    t.names = info.map((s) => (s.kind === "computer" ? "" : s.name));
    const session = new HostSession(t, "host");
    session.onChange = () => this.broadcast();
    this.session = session;
    this.changed();
    return session;
  }

  private broadcast() {
    const info = this.seatInfo();
    for (const g of this.guests) {
      if (!g.connected) continue;
      const seat = this.seats.indexOf(g.id);
      if (this.session && seat > 0) {
        send(g.conn, { type: "state", seat, snap: this.session.t.snapshot(seat) });
      } else {
        send(g.conn, { type: "lobby", code: this.code, seats: info, guests: this.guests.map((x) => x.name), you: g.id });
      }
    }
  }

  close() {
    this.session?.close();
    this.peer.destroy();
    this.listeners.clear();
  }
}

function send(conn: DataConnection, msg: ToGuest | ToHost) {
  if (conn.open) conn.send(msg);
}

// --- Joining -----------------------------------------------------------------------

/** A guest's side: the lobby until the host starts, then a view of the game. */
export class GuestRoom implements Session {
  role = "guest" as const;
  me = 0;
  peer: Peer;
  conn: DataConnection | null = null;
  phase: "connecting" | "lobby" | "playing" | "closed" = "connecting";
  seats: SeatInfo[] = [];
  myId = "";
  error: string | null = null;
  status?: string;
  private t: Table | null = null;
  private listeners = new Set<() => void>();

  constructor(public code: string, public name: string) {
    this.peer = new Peer();
    this.peer.on("open", () => this.connect());
    this.peer.on("error", (e) => this.fail(peerError(e)));
  }

  private connect() {
    const conn = this.peer.connect(PREFIX + this.code, { reliable: true });
    this.conn = conn;
    conn.on("open", () => send(conn, { type: "hello", name: this.name }));
    conn.on("data", (raw) => {
      const msg = raw as ToGuest;
      if (msg.type === "error") { this.fail(msg.message); return; }
      if (msg.type === "lobby") {
        this.phase = "lobby";
        this.seats = msg.seats;
        this.myId = msg.you;
      } else if (msg.type === "state") {
        this.phase = "playing";
        this.me = msg.seat;
        this.t = Table.fromSnapshot(msg.snap);
        this.status = undefined;
      }
      this.notify();
    });
    conn.on("close", () => {
      if (this.phase !== "closed") this.fail("The host has left the game.");
    });
  }

  private fail(message: string) {
    if (this.phase === "closed") return;
    this.error = message;
    this.status = message;
    if (this.phase !== "playing") this.phase = "closed";
    this.notify();
  }

  table() { return this.t!; }
  act(action: Action) { if (this.conn) send(this.conn, { type: "action", action }); }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private notify() { this.listeners.forEach((f) => f()); }

  close() {
    this.phase = "closed";
    this.peer.destroy();
    this.listeners.clear();
  }
}
