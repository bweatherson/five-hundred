// House rules a table can choose before a game. The defaults are the standard
// Australian rules (Avondale scoring), which is what the computer was tuned on.
import { DEFAULT_RULES, RulesConfig } from "../../../src/rules.ts";

export interface HouseRules {
  misere: "afterSeven" | "anytime" | "off";
  openMisere: "anytime" | "afterEight" | "off";
  /** In a misère, the opponents score 10 per trick they take. */
  misereTricks: boolean;
  /** Taking all ten tricks scores at least 250. */
  slam: boolean;
}

export const STANDARD_RULES: HouseRules = { misere: "afterSeven", openMisere: "anytime", misereTricks: false, slam: true };

export const RULE_CHOICES: {
  key: keyof HouseRules;
  label: string;
  options: { value: HouseRules[keyof HouseRules]; label: string }[];
}[] = [
  {
    key: "misere",
    label: "Misère",
    options: [
      { value: "afterSeven", label: "After a 7 bid" },
      { value: "anytime", label: "Any time" },
      { value: "off", label: "Not allowed" },
    ],
  },
  {
    key: "openMisere",
    label: "Open misère",
    options: [
      { value: "anytime", label: "Any time" },
      { value: "afterEight", label: "After an 8 bid" },
      { value: "off", label: "Not allowed" },
    ],
  },
  {
    key: "misereTricks",
    label: "Misère opponents",
    options: [
      { value: false, label: "Score nothing" },
      { value: true, label: "Score 10 a trick" },
    ],
  },
  {
    key: "slam",
    label: "All ten tricks",
    options: [
      { value: true, label: "Scores at least 250" },
      { value: false, label: "Scores the bid" },
    ],
  },
];

export function toRulesConfig(h: HouseRules): RulesConfig {
  return {
    ...DEFAULT_RULES,
    allowMisere: h.misere !== "off",
    misereNeedsSeven: h.misere === "afterSeven",
    openMisere: h.openMisere,
    misereTricksScore: h.misereTricks,
    slamMinimum: h.slam ? 250 : 0,
  };
}

export function fromRulesConfig(r: RulesConfig): HouseRules {
  return {
    misere: r.allowMisere === false ? "off" : r.misereNeedsSeven ? "afterSeven" : "anytime",
    openMisere: r.openMisere ?? "anytime",
    misereTricks: r.misereTricksScore === true,
    slam: r.slamMinimum >= 250,
  };
}

export function isStandard(h: HouseRules) {
  return RULE_CHOICES.every((c) => h[c.key] === STANDARD_RULES[c.key]);
}

/** One line for the bidding panel. */
export function misereNote(h: HouseRules): string {
  const m = h.misere === "afterSeven" ? "Misère needs a 7 bid first." : h.misere === "off" ? "No misère." : "";
  const o = h.openMisere === "afterEight" ? "Open misère needs an 8 bid first." : h.openMisere === "off" ? "No open misère." : "";
  return [m, o].filter(Boolean).join(" ");
}

/** Short descriptions of the rules that differ from the standard ones. */
export function differences(h: HouseRules): string[] {
  const out: string[] = [];
  for (const c of RULE_CHOICES) {
    if (h[c.key] === STANDARD_RULES[c.key]) continue;
    const opt = c.options.find((o) => o.value === h[c.key]);
    out.push(`${c.label}: ${opt?.label.toLowerCase()}`);
  }
  return out;
}

const KEY = "five-hundred-rules";

export function loadRules(): HouseRules {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (raw && typeof raw === "object") {
      const h = { ...STANDARD_RULES };
      for (const c of RULE_CHOICES) {
        if (c.options.some((o) => o.value === raw[c.key])) (h as Record<string, unknown>)[c.key] = raw[c.key];
      }
      return h;
    }
  } catch { /* storage unavailable */ }
  return { ...STANDARD_RULES };
}

export function saveRules(h: HouseRules) {
  try { localStorage.setItem(KEY, JSON.stringify(h)); } catch { /* private browsing */ }
}
