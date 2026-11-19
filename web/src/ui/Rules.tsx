// Choosing house rules before a game.
import { HouseRules, RULE_CHOICES, STANDARD_RULES, differences, isStandard } from "../game/houseRules.ts";

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
