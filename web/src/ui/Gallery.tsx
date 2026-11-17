import { makeDeck } from "../../../src/cards.ts";
import { CardSvg, SvgDefs } from "./Card.tsx";

/** Every card face and the back, for checking the artwork (open the page with #cards). */
export default function Gallery() {
  return (
    <div className="gallery">
      <SvgDefs />
      {[...makeDeck(), null].map((c) => (
        <div key={c ?? "back"} className="gallery-card"><CardSvg card={c ?? undefined} faceDown={c === null} /></div>
      ))}
    </div>
  );
}
