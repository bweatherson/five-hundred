// Card artwork, drawn as SVG so it stays crisp at any size.
import { memo } from "react";
import { Card as CardT, Suit, isJoker, suitOf } from "../../../src/cards.ts";

// Suit shapes in a 100 × 100 box.
export const SUIT_PATHS: Record<Suit, string> = {
  H: "M50 93 C35 80 4 58 4 32 C4 15 16 5 30 5 C40 5 47 11 50 20 C53 11 60 5 70 5 C84 5 96 15 96 32 C96 58 65 80 50 93 Z",
  D: "M50 2 C60 20 74 36 90 50 C74 64 60 80 50 98 C40 80 26 64 10 50 C26 36 40 20 50 2 Z",
  S: "M50 3 C62 22 96 40 96 63 C96 78 85 86 73 86 C64 86 57 81 53 74 C54 85 59 92 68 97 L32 97 C41 92 46 85 47 74 C43 81 36 86 27 86 C15 86 4 78 4 63 C4 40 38 22 50 3 Z",
  C: "M50 6 A21 21 0 0 1 66.5 40 A21 21 0 1 1 55 73 C56 84 60 91 68 97 L32 97 C40 91 44 84 45 73 A21 21 0 1 1 33.5 40 A21 21 0 0 1 50 6 Z",
};

export const SUIT_COLOUR: Record<Suit, string> = { H: "var(--red)", D: "var(--red)", S: "var(--ink)", C: "var(--ink)" };
const RANK_TEXT: Record<string, string> = { T: "10" };

export function SuitIcon({ suit, size = "1em", className }: { suit: Suit; size?: string; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden>
      <path d={SUIT_PATHS[suit]} fill={SUIT_COLOUR[suit]} />
    </svg>
  );
}

function Pip({ suit, x, y, size, flip }: { suit: Suit; x: number; y: number; size: number; flip?: boolean }) {
  const s = size / 100;
  const t = `translate(${x} ${y})${flip ? " rotate(180)" : ""} scale(${s}) translate(-50 -50)`;
  return <path d={SUIT_PATHS[suit]} transform={t} fill={SUIT_COLOUR[suit]} />;
}

// Pip positions on a 250 × 350 card.
const L = 84, C = 125, R = 166;
const T = 84, B = 266, M = 175;
const Q1 = T + (B - T) / 3, Q2 = T + (2 * (B - T)) / 3;
const LAYOUT: Record<number, [number, number][]> = {
  4: [[L, T], [R, T], [L, B], [R, B]],
  5: [[L, T], [R, T], [C, M], [L, B], [R, B]],
  6: [[L, T], [R, T], [L, M], [R, M], [L, B], [R, B]],
  7: [[L, T], [R, T], [C, (T + M) / 2], [L, M], [R, M], [L, B], [R, B]],
  8: [[L, T], [R, T], [C, (T + M) / 2], [L, M], [R, M], [C, (M + B) / 2], [L, B], [R, B]],
  9: [[L, T], [R, T], [L, Q1], [R, Q1], [C, M], [L, Q2], [R, Q2], [L, B], [R, B]],
  10: [[L, T], [R, T], [C, (T + Q1) / 2], [L, Q1], [R, Q1], [L, Q2], [R, Q2], [C, (Q2 + B) / 2], [L, B], [R, B]],
};

const CROWNS: Record<string, string> = {
  K: "M0 30 L2 6 L13 17 L25 0 L37 17 L48 6 L50 30 Z",
  Q: "M0 30 L5 10 L16 21 L25 7 L34 21 L45 10 L50 30 Z",
  J: "M0 30 L25 4 L50 30 L40 30 L25 15 L10 30 Z",
};

function Index({ rank, suit }: { rank: string; suit: Suit }) {
  return (
    <g>
      <text x="29" y="56" textAnchor="middle" className="card-rank" fill={SUIT_COLOUR[suit]}>{rank}</text>
      <Pip suit={suit} x={29} y={80} size={26} />
    </g>
  );
}

function Court({ rank, suit }: { rank: string; suit: Suit }) {
  const red = suit === "H" || suit === "D";
  const half = (
    <g>
      <path d={CROWNS[rank]} transform="translate(100 60)" fill="var(--gold)" />
      <text x="125" y="150" textAnchor="middle" className="card-court" fill={SUIT_COLOUR[suit]}>{rank}</text>
      <Pip suit={suit} x={170} y={70} size={24} />
    </g>
  );
  return (
    <g>
      <rect x="52" y="40" width="146" height="270" rx="10" fill={red ? "var(--court-red)" : "var(--court-black)"} />
      <rect x="52" y="40" width="146" height="270" rx="10" fill="none" stroke="var(--gold)" strokeWidth="2.5" />
      <rect x="59" y="47" width="132" height="256" rx="6" fill="none" stroke="var(--gold)" strokeWidth="0.8" opacity="0.7" />
      {half}
      <g transform="rotate(180 125 175)">{half}</g>
      <line x1="64" y1="175" x2="186" y2="175" stroke="var(--gold)" strokeWidth="1" opacity="0.8" />
      <path d="M125 168 L132 175 L125 182 L118 175 Z" fill="var(--gold)" />
    </g>
  );
}

function JokerFace() {
  const star = "M0 -62 L14 -14 L62 0 L14 14 L0 62 L-14 14 L-62 0 L-14 -14 Z";
  return (
    <g>
      <rect x="40" y="36" width="170" height="278" rx="12" fill="var(--court-black)" />
      <rect x="40" y="36" width="170" height="278" rx="12" fill="none" stroke="var(--gold)" strokeWidth="2.5" />
      <g transform="translate(125 175)">
        <circle r="70" fill="none" stroke="var(--gold)" strokeWidth="1.2" opacity="0.8" />
        <path d={star} transform="rotate(45) scale(0.62)" fill="var(--gold)" />
        <path d={star} fill="var(--ink)" />
        <circle r="9" fill="var(--gold)" />
      </g>
      <text x="125" y="78" textAnchor="middle" className="card-joker-word" fill="var(--ink)">JOKER</text>
      <text x="125" y="292" textAnchor="middle" className="card-joker-word" fill="var(--ink)" transform="rotate(180 125 284)">JOKER</text>
      {[0, 180].map((rot) => (
        <g key={rot} transform={`rotate(${rot} 125 175)`}>
          <path d={star} transform="translate(21 30) scale(0.2)" fill="var(--gold-deep)" />
          {"JOKER".split("").map((ch, i) => (
            <text key={i} x="21" y={62 + i * 19} textAnchor="middle" className="card-joker-index" fill="var(--ink)">{ch}</text>
          ))}
        </g>
      ))}
    </g>
  );
}

function Face({ card }: { card: CardT }) {
  if (isJoker(card)) return <JokerFace />;
  const suit = suitOf(card);
  const r = card[0];
  const rank = RANK_TEXT[r] ?? r;
  let body;
  if (r === "A") {
    body = (
      <g>
        <circle cx="125" cy="175" r="72" fill="none" stroke="var(--gold)" strokeWidth="1.5" />
        <circle cx="125" cy="175" r="66" fill="none" stroke="var(--gold)" strokeWidth="0.6" opacity="0.7" />
        <Pip suit={suit} x={125} y={175} size={92} />
      </g>
    );
  } else if (r === "K" || r === "Q" || r === "J") {
    body = <Court rank={r} suit={suit} />;
  } else {
    const n = r === "T" ? 10 : Number(r);
    body = <g>{LAYOUT[n].map(([x, y], i) => <Pip key={i} suit={suit} x={x} y={y} size={44} flip={y > M + 1} />)}</g>;
  }
  return (
    <g>
      {body}
      <Index rank={rank} suit={suit} />
      <g transform="rotate(180 125 175)"><Index rank={rank} suit={suit} /></g>
    </g>
  );
}

export const CardSvg = memo(function CardSvg({ card, faceDown }: { card?: CardT; faceDown?: boolean }) {
  return (
    <svg viewBox="0 0 250 350" className="card-svg" aria-label={faceDown || !card ? "card" : card}>
      {faceDown || !card ? (
        <g>
          <rect x="0" y="0" width="250" height="350" rx="18" fill="var(--back)" />
          <rect x="12" y="12" width="226" height="326" rx="10" fill="url(#back-lattice)" stroke="var(--gold)" strokeWidth="2" />
          <g transform="translate(125 175)">
            <circle r="46" fill="var(--back)" stroke="var(--gold)" strokeWidth="2" />
            <circle r="39" fill="none" stroke="var(--gold)" strokeWidth="0.8" opacity="0.7" />
            <text y="12" textAnchor="middle" className="card-back-mark">500</text>
          </g>
        </g>
      ) : (
        <g>
          <rect x="0" y="0" width="250" height="350" rx="18" fill="var(--paper)" />
          <rect x="0.75" y="0.75" width="248.5" height="348.5" rx="17.5" fill="none" stroke="var(--edge)" strokeWidth="1.5" />
          <Face card={card} />
        </g>
      )}
    </svg>
  );
});

/** Shared SVG definitions (the card-back pattern), rendered once per page. */
export function SvgDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        <pattern id="back-lattice" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="22" height="22" fill="var(--back)" />
          <rect x="3" y="3" width="16" height="16" fill="none" stroke="var(--gold)" strokeWidth="1" opacity="0.55" />
          <circle cx="11" cy="11" r="1.6" fill="var(--gold)" opacity="0.6" />
        </pattern>
      </defs>
    </svg>
  );
}
