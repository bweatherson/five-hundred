import { CSSProperties, Fragment, createContext, useContext, useEffect, useState } from "react";
import { Card, Suit, SUITS } from "../../../src/cards.ts";
import { Bid, BidAction, bidValue, Strain, teamOf } from "../../../src/rules.ts";
import { RELATIVE_NAMES, Table } from "../game/table.ts";
import { Session } from "../game/session.ts";
import { CardSvg, SuitIcon, SvgDefs } from "./Card.tsx";
import { ReviewModal } from "./Review.tsx";
import { sortHand } from "./sort.ts";

type Pos = "south" | "west" | "north" | "east";
const POS: Pos[] = ["south", "west", "north", "east"];

/** Everything about the table that depends on whose screen it is. */
export interface Viewer {
  me: number;
  /** Seat's position on this screen: 0 = bottom, 1 = left, 2 = top, 3 = right. */
  rel: (seat: number) => number;
  name: (seat: number) => string;
  /** "Us" for this screen's team, "Them" for the other. */
  teamName: (team: number) => string;
  /** 0 for this screen's team, 1 for the other (for colours). */
  side: (team: number) => number;
}

export function makeViewer(t: Table, me: number): Viewer {
  const rel = (seat: number) => (seat - me + 4) % 4;
  return {
    me,
    rel,
    name: (seat) => (seat === me ? "You" : t.humans[seat] && t.names[seat] ? t.names[seat] : RELATIVE_NAMES[rel(seat)]),
    teamName: (team) => (team === me % 2 ? "Us" : "Them"),
    side: (team) => (team === me % 2 ? 0 : 1),
  };
}

const ViewerCtx = createContext<Viewer>(null as unknown as Viewer);
const useViewer = () => useContext(ViewerCtx);

// Where each seat's card lands in the trick, in card widths from the centre, and its tilt.
const TRICK_SPOT: Record<Pos, { x: number; y: number; r: number }> = {
  south: { x: 0.04, y: 0.74, r: -2 },
  west: { x: -0.92, y: 0.08, r: -8 },
  north: { x: -0.04, y: -0.66, r: 3 },
  east: { x: 0.92, y: -0.04, r: 7 },
};
// Where cards fly in from (and are swept to), in card widths.
const SEAT_DIR: Record<Pos, { x: number; y: number }> = {
  south: { x: 0, y: 4 }, west: { x: -5, y: 0 }, north: { x: 0, y: -4 }, east: { x: 5, y: 0 },
};

function useViewport() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return size;
}

export function BidText({ bid }: { bid: BidAction }) {
  if (bid === null) return <span className="bid-text pass">Pass</span>;
  if (bid.kind === "misere") return <span className="bid-text">Misère</span>;
  if (bid.kind === "openMisere") return <span className="bid-text">Open misère</span>;
  return (
    <span className="bid-text">
      {bid.tricks}
      {bid.strain === "NT" ? <span className="nt">NT</span> : <SuitIcon suit={bid.strain} className="bid-suit" />}
    </span>
  );
}

export default function App({ session, onLeave, onNewGame }: { session: Session; onLeave?: () => void; onNewGame?: () => void }) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);
  useEffect(() => session.subscribe(refresh), [session]);
  const t = session.table();
  const me = session.me;
  const HUMAN = me;
  const v = makeViewer(t, me);
  if (import.meta.env.DEV) Object.assign(window, { __table: t, __session: session, __refresh: refresh });
  const collecting = t.collecting;
  const [showReview, setShowReview] = useState(false);
  const [selected, setSelected] = useState<Card[]>([]);
  const [jokerPending, setJokerPending] = useState(false);
  const [showLast, setShowLast] = useState(false);
  const { w, h } = useViewport();
  // A phone held upright gets its own layout; a tablet held upright keeps the
  // table layout, with cards sized from its width.
  const portrait = h > w && w < 700;
  const tabletUpright = h > w && w >= 700;
  const cw = tabletUpright
    ? Math.round(Math.min(w * 0.105, 116))
    : Math.round(Math.max(50, Math.min(w * 0.085, h * 0.125, 116)));
  // Your own cards are drawn larger (and overlap more) on upright screens.
  const hcw = portrait ? Math.round(Math.min(84, Math.max(cw, w * 0.19))) : tabletUpright ? Math.round(Math.min(w * 0.125, 120)) : cw;

  // The computer players and the pacing run in the session (on the host's screen).
  const phase = t.phase;
  const actor = t.actor();

  useEffect(() => { setSelected([]); setShowReview(false); }, [phase, t.handNo]);

  const trump = t.contract?.trump ?? null;
  const myHand = sortHand(t.hands[HUMAN], trump);
  const myTurnToPlay = phase === "play" && actor === HUMAN;
  const legal = myTurnToPlay ? t.legalPlays(HUMAN) : [];
  const discarding = phase === "discard" && t.contract?.bidder === HUMAN;
  const lastBids = t.lastBids();

  function clickCard(c: Card) {
    if (discarding) {
      setSelected((s) => (s.includes(c) ? s.filter((x) => x !== c) : s.length < 3 ? [...s, c] : s));
      return;
    }
    if (!myTurnToPlay || !legal.includes(c)) return;
    if (t.needsJokerSuit(c)) { setJokerPending(true); return; }
    session.act({ type: "play", card: c });
  }

  const tricks = t.tricksWon();
  const tcw = portrait ? Math.round(Math.max(cw, hcw * 0.86)) : cw;
  const style = { "--cw": `${cw}px`, "--hcw": `${hcw}px`, "--tcw": `${tcw}px` } as CSSProperties;

  return (
    <ViewerCtx.Provider value={v}>
    <div className={`app ${portrait ? "portrait" : "landscape"} ${tabletUpright ? "tablet-upright" : ""}`} style={style}>
      <SvgDefs />
      <header className="hud">
        <div className="scores">
          {[me % 2, 1 - (me % 2)].map((team) => (
            <div key={team} className={`score team-${v.side(team)}`}>
              <span className="score-label">{v.teamName(team)}</span>
              <span className="score-value">{t.scores[team]}</span>
            </div>
          ))}
        </div>
        <ContractChip t={t} tricks={tricks} />
        <div className="hud-actions">
          {t.play && t.play.tricks.length > 0 && (
            <button className="ghost" onClick={() => setShowLast((s) => !s)}>{showLast ? "Hide last trick" : "Last trick"}</button>
          )}
          {onNewGame && <button className="ghost" onClick={onNewGame}>New game</button>}
          {onLeave && <button className="ghost" onClick={onLeave}>Leave</button>}
        </div>
      </header>
      {session.status && <div className="net-status">{session.status}</div>}

      <main className="felt">
        {[1, 2, 3].map((r) => {
          const seat = (me + r) % 4;
          return <OtherSeat key={seat} t={t} seat={seat} active={actor === seat} lastBid={lastBids[seat]} />;
        })}

        <div className="trick">
          {t.trickOnTable().map((p) => {
            const pos = POS[v.rel(p.seat)];
            const spot = TRICK_SPOT[pos];
            const from = SEAT_DIR[pos];
            const winner = t.lastTrick?.winner;
            const to = winner !== undefined ? SEAT_DIR[POS[v.rel(winner)]] : { x: 0, y: 0 };
            const st = {
              "--x": spot.x, "--y": spot.y, "--r": `${spot.r}deg`,
              "--fx": from.x, "--fy": from.y, "--tx": to.x * 0.8, "--ty": to.y * 0.8,
            } as CSSProperties;
            return (
              <div key={p.card} className={`trick-card ${collecting ? "collect" : ""} ${t.lastTrick && p.seat === winner ? "winning" : ""}`} style={st}>
                <CardSvg card={p.card} />
              </div>
            );
          })}
          {t.jokerNamed && (
            <div className="joker-named">Joker leads as <SuitIcon suit={t.jokerNamed} /></div>
          )}
        </div>

        <CenterPrompt t={t} actor={actor} onBid={(b) => session.act({ type: "bid", bid: b })} />

        {discarding && (
          <div className="discard-bar">
            <div>You won the bid with <BidText bid={t.contract!.bid} />. Choose three cards to put away.</div>
            <button className="primary" disabled={selected.length !== 3} onClick={() => session.act({ type: "discard", cards: selected })}>
              Discard {selected.length}/3
            </button>
          </div>
        )}

        <div className={`you ${actor === HUMAN && phase !== "trickEnd" ? "active" : ""}`}>
          <Nameplate t={t} seat={HUMAN} lastBid={lastBids[HUMAN]} active={actor === HUMAN} />
          {t.sittingOut(HUMAN) && <div className="sitting-out">{t.contract && t.humans[t.contract.bidder] && t.names[t.contract.bidder] ? t.names[t.contract.bidder] : "Partner"} is playing misère: you sit this one out.</div>}
        </div>

        <Hand
          cards={myHand}
          cw={hcw}
          width={w}
          playable={discarding ? myHand : legal}
          dim={myTurnToPlay}
          selected={selected}
          kitty={discarding ? t.kitty : []}
          faded={t.sittingOut(HUMAN)}
          onClick={clickCard}
        />

        {showLast && t.play && t.play.tricks.length > 0 && <LastTrick t={t} onClose={() => setShowLast(false)} />}
      </main>

      {jokerPending && (
        <div className="modal-back">
          <div className="modal">
            <h2>Name the Joker's suit</h2>
            <p>In no-trumps the Joker is led as a suit of your choice. Everyone must follow it.</p>
            <div className="suit-choice">
              {SUITS.map((s) => (
                <button key={s} onClick={() => { setJokerPending(false); session.act({ type: "play", card: "JK", suit: s }); }}>
                  <SuitIcon suit={s} size="2.4em" />
                </button>
              ))}
            </div>
            <button className="ghost" onClick={() => setJokerPending(false)}>Cancel</button>
          </div>
        </div>
      )}

      {(phase === "handEnd" || phase === "gameEnd") && t.summary && !showReview && (
        <HandSummaryModal t={t} onNext={() => session.act({ type: "ready" })} onReview={() => setShowReview(true)} />
      )}
      {(phase === "handEnd" || phase === "gameEnd") && showReview && (
        <ReviewModal t={t} viewer={v} onClose={() => setShowReview(false)} />
      )}
    </div>
    </ViewerCtx.Provider>
  );
}

function ContractChip({ t, tricks }: { t: Table; tricks: [number, number] }) {
  const v = useViewer();
  if (!t.contract) {
    if (t.phase === "redeal") return <div className="contract-chip muted">All passed. Redealing…</div>;
    const high = t.high;
    return (
      <div className="contract-chip muted">
        {high ? <>High bid <BidText bid={high.bid} /> <span className="by">{v.name(high.seat)}</span></> : "Bidding"}
      </div>
    );
  }
  const c = t.contract;
  const bt = teamOf(c.bidder);
  const need = c.misere ? "no tricks" : `${(c.bid as { tricks: number }).tricks} tricks`;
  return (
    <div className="contract-chip">
      <span className="by">{v.name(c.bidder)}</span>
      <BidText bid={c.bid} />
      <span className="need">needs {need}</span>
      {t.play && (
        <span className="tally">
          {[v.me % 2, 1 - (v.me % 2)].map((team, i) => (
            <Fragment key={team}>
              {i > 0 && <span className="sep">·</span>}
              <span className={bt === team ? "ours" : ""}>{v.teamName(team)} {tricks[team]}</span>
            </Fragment>
          ))}
        </span>
      )}
    </div>
  );
}

function Nameplate({ t, seat, lastBid, active }: { t: Table; seat: number; lastBid: BidAction | undefined; active: boolean }) {
  const v = useViewer();
  const isBidder = t.contract?.bidder === seat;
  return (
    <div className={`nameplate team-${v.side(teamOf(seat))} ${active ? "active" : ""} ${t.sittingOut(seat) ? "out" : ""}`}>
      {t.dealer === seat && <span className="dealer" title="Dealer">D</span>}
      <span className="name">{v.name(seat)}</span>
      {isBidder && t.contract && <span className="bidder-tag"><BidText bid={t.contract.bid} /></span>}
      {t.phase === "auction" || t.phase === "redeal"
        ? lastBid !== undefined && <span className={`bubble ${lastBid === null ? "pass" : ""}`}><BidText bid={lastBid} /></span>
        : null}
    </div>
  );
}

function OtherSeat({ t, seat, active, lastBid }: { t: Table; seat: number; active: boolean; lastBid: BidAction | undefined }) {
  const v = useViewer();
  const pos = POS[v.rel(seat)];
  const cards = t.hands[seat];
  const exposed = !!t.contract?.open && t.contract.bidder === seat && t.phase !== "auction" && t.phase !== "discard";
  const shown = exposed ? sortHand(cards, null) : cards;
  const n = shown.length;
  const vertical = pos !== "north";
  return (
    <div className={`seat seat-${pos} ${t.sittingOut(seat) ? "out" : ""}`}>
      <Nameplate t={t} seat={seat} lastBid={lastBid} active={active && t.phase !== "trickEnd"} />
      <div className={`mini-hand ${vertical ? "vertical" : ""} ${exposed ? "exposed" : ""}`} style={{ "--n": n } as CSSProperties}>
        {shown.map((c, i) => (
          <div key={exposed ? c : i} className="mini-card" style={{ "--i": i, "--k": i - (n - 1) / 2 } as CSSProperties}>
            <CardSvg card={c} faceDown={!exposed} />
          </div>
        ))}
      </div>
      {t.sittingOut(seat) && <div className="sitting-out small">sits out</div>}
    </div>
  );
}

function Hand(props: {
  cards: Card[]; cw: number; width: number; playable: Card[]; dim: boolean; selected: Card[]; kitty: Card[];
  faded: boolean; onClick: (c: Card) => void;
}) {
  const { cards, cw, width, playable, dim, selected, kitty, faded, onClick } = props;
  const n = cards.length;
  // Fan the cards, keeping the tilted outer cards on screen.
  const narrow = width < cw * 9;
  const angle = n > 1 ? Math.min(narrow ? 1.5 : 2.6, (narrow ? 14 : 26) / (n - 1)) : 0;
  const lean = Math.sin((angle * (n - 1) * Math.PI) / 360) * cw * 1.96;
  const avail = Math.min(width - 20 - 2 * lean, cw * 13);
  const step = n > 1 ? Math.min(cw * 0.7, (avail - cw) / (n - 1)) : 0;
  return (
    <div className={`hand ${faded ? "faded" : ""}`}>
      {cards.map((c, i) => {
        const k = i - (n - 1) / 2;
        const canPlay = playable.includes(c);
        const style = {
          transform: `translateX(${k * step}px) translateY(${k * k * cw * 0.008}px) rotate(${k * angle}deg)`,
          zIndex: i,
        } as CSSProperties;
        return (
          <div key={c} className="hand-slot" style={style}>
            <button
              className={`hand-card ${canPlay ? "playable" : ""} ${dim && !canPlay ? "dim" : ""} ${selected.includes(c) ? "selected" : ""}`}
              onClick={() => onClick(c)}
              disabled={!canPlay}
              aria-label={c}
            >
              <CardSvg card={c} />
              {kitty.includes(c) && <span className="kitty-tag">kitty</span>}
            </button>
          </div>
        );
      })}
    </div>
  );
}

const BID_ROWS = [6, 7, 8, 9, 10];
const STRAIN_COLS: Strain[] = ["S", "C", "D", "H", "NT"];

function CenterPrompt({ t, actor, onBid }: { t: Table; actor: number | null; onBid: (b: BidAction) => void }) {
  const v = useViewer();
  if (t.phase !== "auction" || actor !== v.me) {
    if (t.phase === "discard" && t.contract && t.contract.bidder !== v.me) {
      return <div className="center-note">{v.name(t.contract.bidder)} takes the kitty…</div>;
    }
    if (t.phase === "redeal") return <div className="center-note">Everyone passed. New deal coming.</div>;
    return null;
  }
  const legal = t.legalBids();
  const isLegal = (b: Bid) => legal.some((x) => JSON.stringify(x) === JSON.stringify(b));
  const special: Bid[] = [{ kind: "misere" }, { kind: "openMisere" }];
  return (
    <div className="bid-panel">
      <div className="bid-head">
        <h2>Your bid</h2>
        {t.high && <div className="bid-high">to beat: <BidText bid={t.high.bid} /> <span>({v.name(t.high.seat)})</span></div>}
      </div>
      <div className="bid-grid">
        {BID_ROWS.map((n) =>
          STRAIN_COLS.map((s) => {
            const b: Bid = { kind: "suit", tricks: n, strain: s };
            const ok = isLegal(b);
            return (
              <button key={`${n}${s}`} className={`bid-cell strain-${s}`} disabled={!ok} onClick={() => onBid(b)}>
                <BidText bid={b} />
                <span className="bid-pts">{bidValue(b)}</span>
              </button>
            );
          }),
        )}
      </div>
      <div className="bid-specials">
        {special.map((b) => (
          <button key={b.kind} className="bid-cell wide" disabled={!isLegal(b)} onClick={() => onBid(b)}>
            <BidText bid={b} />
            <span className="bid-pts">{bidValue(b)}</span>
          </button>
        ))}
        <button className="bid-cell wide pass-btn" onClick={() => onBid(null)}>Pass</button>
      </div>
      <p className="bid-foot">Misère needs a 7 bid first. Once you pass, you're out of the auction.</p>
    </div>
  );
}

function LastTrick({ t, onClose }: { t: Table; onClose: () => void }) {
  const v = useViewer();
  const tr = t.play!.tricks[t.play!.tricks.length - 1];
  return (
    <div className="last-trick" onClick={onClose}>
      <div className="last-title">Last trick: won by {tr.winner === v.me ? "you" : v.name(tr.winner)}</div>
      <div className="last-cards">
        {tr.plays.map((p) => (
          <div key={p.card} className={`last-card ${p.seat === tr.winner ? "won" : ""}`}>
            <CardSvg card={p.card} />
            <span>{v.name(p.seat)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HandSummaryModal({ t, onNext, onReview }: { t: Table; onNext: () => void; onReview: () => void }) {
  const v = useViewer();
  const s = t.summary!;
  const bt = v.side(teamOf(s.contract.bidder));
  const who = v.name(s.contract.bidder);
  const took = s.tricks[teamOf(s.contract.bidder)];
  const title = s.score.made ? (bt === 0 ? "Contract made" : "They made it") : bt === 0 ? "We went down" : "They're set!";
  const mine = t.review.filter((r) => r.seat === v.me);
  const differ = mine.filter((r) => !r.same).length;
  const iAmReady = t.ready[v.me];
  const waiting = t.waitingFor().filter((x) => x !== v.me);
  const fmt = (x: number) => (x > 0 ? `+${x}` : `${x}`);
  return (
    <div className="modal-back">
      <div className={`modal summary ${s.score.made === (bt === 0) ? "good" : "bad"}`}>
        <h2>{title}</h2>
        <p className="summary-line">
          {who} bid <BidText bid={s.contract.bid} /> and {s.contract.misere ? (took === 0 ? "took no tricks" : `took ${took} trick${took === 1 ? "" : "s"}`) : `took ${took} trick${took === 1 ? "" : "s"}`}.
        </p>
        <div className="summary-table">
          {[v.me % 2, 1 - (v.me % 2)].map((team) => (
            <div key={team} className="summary-row">
              <span className="team">{v.teamName(team)}</span>
              <span className="tricks">{s.tricks[team]} tricks</span>
              <span className={`delta ${s.score.points[team] < 0 ? "neg" : ""}`}>{fmt(s.score.points[team])}</span>
              <span className="total">{s.scoresAfter[team]}</span>
            </div>
          ))}
        </div>
        {s.winner !== null && <p className="game-over">{v.side(s.winner) === 0 ? "You win the game!" : "They win the game."}</p>}
        <div className="summary-actions">
          {mine.length > 0 && (
            <button className="ghost" onClick={onReview}>
              {differ === 0 ? "Review: the computer agreed with you" : `Review: ${differ} difference${differ === 1 ? "" : "s"}`}
            </button>
          )}
          <button className="primary" disabled={iAmReady} onClick={onNext}>
            {iAmReady ? `Waiting for ${waiting.map((x) => v.name(x)).join(" and ")}…` : s.winner !== null ? "New game" : "Next hand"}
          </button>
        </div>
      </div>
    </div>
  );
}

export type { Suit };
