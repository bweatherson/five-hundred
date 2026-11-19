// Choosing house rules before a game.
import { HouseRules, RULE_CHOICES, STANDARD_RULES, differences, isStandard } from "../game/houseRules.ts";
import { Strain, bidValue } from "../../../src/rules.ts";

export function RulesEditor({ value, onChange }: { value: HouseRules; onChange: (h: HouseRules) => void }) {
  return (
    <div className="rules-editor">
      {RULE_CHOICES.map((c) => (
        <div key={c.key} className="rules-row" role="radiogroup" aria-label={c.label}>
          <div className="rules-label">{c.label}</div>
          <div className="rules-options">
            {c.options.map((o) => (
              <button
                key={String(o.value)}
                type="button"
                role="radio"
                aria-checked={value[c.key] === o.value}
                className={`rules-option ${value[c.key] === o.value ? "on" : ""}`}
                onClick={() => onChange({ ...value, [c.key]: o.value })}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="rules-foot">
        {isStandard(value) ? "These are the standard rules." : (
          <>
            Changed from the standard rules.{" "}
            <button type="button" className="link" onClick={() => onChange({ ...STANDARD_RULES })}>Reset</button>
          </>
        )}{" "}
        The computer was tuned on the standard rules.
      </p>
    </div>
  );
}

/** "Standard rules", or the rules that differ from them. */
export function RulesSummary({ value }: { value: HouseRules }) {
  const d = differences(value);
  return <p className="lobby-note">{d.length === 0 ? "Standard rules." : `House rules: ${d.join("; ")}.`}</p>;
}

const STRAIN_HEAD: { s: Strain; label: string; red?: boolean }[] = [
  { s: "S", label: "♠" }, { s: "C", label: "♣" }, { s: "D", label: "♦", red: true }, { s: "H", label: "♥", red: true }, { s: "NT", label: "NT" },
];

/** How to play, written for the house rules currently chosen. */
export function HowToPlay({ rules }: { rules: HouseRules }) {
  const misere =
    rules.misere === "afterSeven" ? "It can only be bid once someone has bid 7 or more." :
    rules.misere === "anytime" ? "It can be bid at any point in the auction." : null;
  const open =
    rules.openMisere === "afterEight" ? "It can only be bid once someone has bid 8 or more." :
    rules.openMisere === "anytime" ? "It can be bid at any point in the auction." : null;
  return (
    <div className="howto">
      <section>
        <h2>The cards</h2>
        <p>
          Four players in two partnerships; partners sit opposite. The deck has 43 cards: the 5s to the aces in every
          suit, the red 4s, and the Joker. Everyone gets ten cards, and three go face down in the middle as the kitty.
        </p>
      </section>

      <section>
        <h2>Trumps</h2>
        <p>The trump suit ranks, from the top:</p>
        <ol className="howto-ranks">
          <li><b>Joker</b></li>
          <li><b>Right bower</b>: the jack of trumps</li>
          <li><b>Left bower</b>: the other jack of the same colour, which counts as a trump and not as its printed suit</li>
          <li>A, K, Q, 10, 9 and so on down</li>
        </ol>
        <p>In other suits, aces are high and the cards run down as usual.</p>
      </section>

      <section>
        <h2>Bidding</h2>
        <p>
          Starting left of the dealer, each player bids how many tricks their partnership will take, from 6 to 10,
          and names trumps or no trumps. Each bid must be worth more than the last (see the table below). Once you
          pass, you're out of the auction. If everyone passes, the cards are redealt.
        </p>
        <p>
          The highest bidder picks up the kitty, puts back any three cards, and leads to the first trick.
        </p>
      </section>

      {(misere || open) && (
        <section>
          <h2>Misère</h2>
          {misere && (
            <p>
              <b>Misère</b> (250) is a bid to lose every trick, playing alone in no trumps while your partner sits the
              hand out. It ranks between 8♠ and 8♣. {misere}
            </p>
          )}
          {open && (
            <p>
              <b>Open misère</b> (500) is the same, but your hand is laid face up once play starts. It ranks just
              below 10♥. {open}
            </p>
          )}
        </section>
      )}

      <section>
        <h2>Play</h2>
        <p>
          Follow the suit led if you can; if you can't, play anything. The highest trump wins the trick, or if no
          trump was played, the highest card of the suit led. The winner leads next.
        </p>
        <p>
          In no trumps the Joker is the only trump. You may only play it when you can't follow suit, and it wins
          the trick. If you lead it, you name the suit the others must follow.
        </p>
      </section>

      <section>
        <h2>Scoring</h2>
        <p>
          If the bidders take at least as many tricks as they bid, they score the bid; if not, they lose that many
          points. Either way, the other side scores 10 for every trick it takes.
          {rules.slam && " Taking all ten tricks scores at least 250, even when the bid is worth less."}
        </p>
        <div className="howto-table-wrap">
          <table className="howto-table">
            <thead>
              <tr>
                <th scope="col">Tricks</th>
                {STRAIN_HEAD.map((h) => <th key={h.s} scope="col" className={h.red ? "red" : ""}>{h.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {[6, 7, 8, 9, 10].map((t) => (
                <tr key={t}>
                  <th scope="row">{t}</th>
                  {STRAIN_HEAD.map((h) => <td key={h.s}>{bidValue({ kind: "suit", tricks: t, strain: h.s })}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          The first side to 500 wins, even if it gets there on defence. If both sides pass 500 on the same hand,
          the bidders win. A side that falls to −500 loses.
        </p>
      </section>
      {!isStandard(rules) && <p className="rules-foot">This describes your house rules. Change them under House rules.</p>}
    </div>
  );
}
