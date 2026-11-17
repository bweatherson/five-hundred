// After a hand: where the computer would have bid, discarded or played differently.
import { Card } from "../../../src/cards.ts";
import { BidAction } from "../../../src/rules.ts";
import { ReviewItem, Table } from "../game/table.ts";
import type { Viewer } from "./App.tsx";
import { BidText } from "./App.tsx";
import { CardSvg } from "./Card.tsx";
import { sortHand } from "./sort.ts";

function Cards({ cards, mark }: { cards: Card[]; mark?: Card[] }) {
  return (
    <span className="rv-cards">
      {cards.map((c) => (
        <span key={c} className={`rv-card ${mark?.includes(c) ? "marked" : ""}`}><CardSvg card={c} /></span>
      ))}
    </span>
  );
}

function Item({ r, t, v }: { r: ReviewItem; t: Table; v: Viewer }) {
  const trump = t.summary?.contract.trump ?? null;
  if (r.kind === "bid") {
    return (
      <li className="rv-item">
        <div className="rv-when">Bidding</div>
        <div className="rv-line">
          You bid <BidText bid={r.actual as BidAction} />; the computer would have
          {r.suggested === null ? " passed." : <> bid <BidText bid={r.suggested as BidAction} />.</>}
        </div>
        {r.hand && <Cards cards={sortHand(r.hand, null)} />}
      </li>
    );
  }
  if (r.kind === "discard") {
    const actual = r.actual as Card[];
    const suggested = r.suggested as Card[];
    return (
      <li className="rv-item">
        <div className="rv-when">Discard</div>
        <div className="rv-pair">
          <div><div className="rv-label">You put away</div><Cards cards={sortHand(actual, trump)} mark={actual.filter((c) => !suggested.includes(c))} /></div>
          <div><div className="rv-label">The computer would put away</div><Cards cards={sortHand(suggested, trump)} mark={suggested.filter((c) => !actual.includes(c))} /></div>
        </div>
      </li>
    );
  }
  const before = r.before ?? [];
  return (
    <li className="rv-item">
      <div className="rv-when">Trick {r.trick}{before.length === 0 ? ", your lead" : ""}</div>
      {before.length > 0 && (
        <div className="rv-before">
          {before.map((p) => (
            <span key={p.card} className="rv-play"><span className="rv-card"><CardSvg card={p.card} /></span><span className="rv-who">{v.name(p.seat)}</span></span>
          ))}
        </div>
      )}
      <div className="rv-pair">
        <div><div className="rv-label">You played</div><Cards cards={[r.actual as Card]} /></div>
        <div><div className="rv-label">The computer would play</div><Cards cards={[r.suggested as Card]} mark={[r.suggested as Card]} /></div>
      </div>
    </li>
  );
}

export function ReviewModal({ t, viewer: v, onClose }: { t: Table; viewer: Viewer; onClose: () => void }) {
  const mine = t.review.filter((r) => r.seat === v.me);
  const diffs = mine.filter((r) => !r.same);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal review" onClick={(e) => e.stopPropagation()}>
        <h2>How the computer would have played</h2>
        <p className="rv-intro">
          {diffs.length === 0
            ? `The computer would have made the same choice at all ${mine.length} of your decisions this hand.`
            : `It agreed with ${mine.length - diffs.length} of your ${mine.length} decisions. Where it would have done something else:`}
        </p>
        {diffs.length > 0 && <ol className="rv-list">{diffs.map((r, i) => <Item key={i} r={r} t={t} v={v} />)}</ol>}
        <p className="rv-foot">Forced plays aren't counted. The computer is the same player as your opponents, so this is a second opinion, not the right answer.</p>
        <button className="primary" onClick={onClose}>Back to the scores</button>
      </div>
    </div>
  );
}
