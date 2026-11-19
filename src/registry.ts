// Named strategies for the command line. A spec is a name, optionally with
// parameter overrides: "heuristic:aggression=0.5,jump=true".
import { Strategy } from "./player.ts";
import { randomStrategy } from "./strategies/random.ts";
import { HeuristicParams, heuristicStrategy } from "./strategies/heuristic.ts";
import { simulationStrategy } from "./strategies/simulation.ts";
import { DEFAULT_INFERENCE, FIT_INFERENCE } from "./strategies/inference.ts";
import { isTrump, teamOf } from "./rules.ts";
import { isBoss, unseenCards } from "./strategies/util.ts";

type Factory = (overrides: Record<string, number | boolean | string>) => Strategy;

const heur = (base: Partial<HeuristicParams>): Factory => (o) => heuristicStrategy({ ...base, ...o });

export const STRATEGIES: Record<string, { describe: string; make: Factory }> = {
  random: { describe: "random legal plays, timid random bids", make: () => randomStrategy() },
  heuristic: { describe: "rule-of-thumb bidding and play (default parameters)", make: heur({}) },
  bold: { describe: "heuristic, bids half a trick more aggressively", make: heur({ aggression: 0.5 }) },
  cautious: { describe: "heuristic, bids half a trick more conservatively", make: heur({ aggression: -0.5 }) },
  jumper: { describe: "heuristic, jumps straight to its maximum bid", make: heur({ jump: true }) },
  tuned: {
    describe: "best settings from the Nov 2026 sweeps: bolder suit bids, strict misère, wary of opponents' suits",
    make: heur({ aggression: 0.75, misereModel: "gap", misereDanger: 1, misereSlack: 1, opponentStrainPenalty: 1.5 }),
  },
  tuned2: {
    describe: "tuned + trump in second seat when void + 'eval' kitty discards + 6-level signal bids (any suit) + more weight on partner's suit",
    make: heur({
      aggression: 0.75, misereModel: "gap", misereDanger: 1, misereSlack: 1, opponentStrainPenalty: 1.5,
      secondHandRuff: true, discardMode: "eval", signalBid: 2.5, signalStrains: "all", partnerSupport: 1.5,
    }),
  },
  tuned3: {
    describe: "tuned2 + game-score bidding: pass when partner's bid wins the game, +2 tricks aggression against a game-winning opposing bid, +1.5 when trailing an opponent on 300+",
    make: heur({
      aggression: 0.75, misereModel: "gap", misereDanger: 1, misereSlack: 1, opponentStrainPenalty: 1.5,
      secondHandRuff: true, discardMode: "eval", signalBid: 2.5, signalStrains: "all", partnerSupport: 1.5,
      stopAtWin: true, desperation: 2, behindScore: 300, behindAdjust: 1.5,
    }),
  },
  tuned4: {
    describe: "tuned3 with the trick estimate fitted to 1M playouts (estimateModel=fit), re-tuned: aggression −0.5, signal bids at 4, desperation 1, trailing boost 1",
    make: heur({
      aggression: -0.5, misereModel: "gap", misereDanger: 1, misereSlack: 1, opponentStrainPenalty: 1.5,
      secondHandRuff: true, discardMode: "eval", signalBid: 4, signalStrains: "all", partnerSupport: 1.5,
      stopAtWin: true, desperation: 1, behindScore: 300, behindAdjust: 1,
      estimateModel: "fit", discardModel: "classic",
    }),
  },
  tuned5: {
    describe: "tuned4 + bidders keep their last trump in reserve (never lead it while trumps are out)",
    make: heur({
      aggression: -0.5, misereModel: "gap", misereDanger: 1, misereSlack: 1, opponentStrainPenalty: 1.5,
      secondHandRuff: true, discardMode: "eval", signalBid: 4, signalStrains: "all", partnerSupport: 1.5,
      stopAtWin: true, desperation: 1, behindScore: 300, behindAdjust: 1,
      estimateModel: "fit", discardModel: "classic", bidderKeepTrumps: 1,
    }),
  },
  tuned6: {
    describe: "tuned5 + guarded discards (keep winners and honour guards), defenders lead partner's bid suit, 7-level bids +0.25 tricks bolder",
    make: heur({
      aggression: -0.5, misereModel: "gap", misereDanger: 1, misereSlack: 1, opponentStrainPenalty: 1.5,
      secondHandRuff: true, discardMode: "eval", signalBid: 4, signalStrains: "all", partnerSupport: 1.5,
      stopAtWin: true, desperation: 1, behindScore: 300, behindAdjust: 1,
      estimateModel: "fit", discardModel: "classic", bidderKeepTrumps: 1,
      guardDiscards: 2, leadPartnerSuit: 1, aggression7: 0.25, aggression8: -0.25,
    }),
  },
  tuned7: {
    describe: "tuned6 + probe-derived play: ruff low in 2nd/3rd seat, overtake partner's non-boss card, defenders duck a doubleton boss second hand, bidder without the boss trump stops leading trumps with 1 out",
    make: heur({
      aggression: -0.5, misereModel: "gap", misereDanger: 1, misereSlack: 1, opponentStrainPenalty: 1.5,
      secondHandRuff: true, discardMode: "eval", signalBid: 4, signalStrains: "all", partnerSupport: 1.5,
      stopAtWin: true, desperation: 1, behindScore: 300, behindAdjust: 1,
      estimateModel: "fit", discardModel: "classic", bidderKeepTrumps: 1,
      guardDiscards: 2, leadPartnerSuit: 1, aggression7: 0.25, aggression8: -0.25,
      ruffLow: 2, overtakePartner: 2, secondHandDuck: 1, noBossTrumpLead: 1,
    }),
  },
  tuned8: {
    describe: "tuned7 + defenders keep the Joker on an opponent's trump lead unless last to play, and lead their top trump from trick 7 when needing 2+ tricks",
    make: heur({
      aggression: -0.5, misereModel: "gap", misereDanger: 1, misereSlack: 1, opponentStrainPenalty: 1.5,
      secondHandRuff: true, discardMode: "eval", signalBid: 4, signalStrains: "all", partnerSupport: 1.5,
      stopAtWin: true, desperation: 1, behindScore: 300, behindAdjust: 1,
      estimateModel: "fit", discardModel: "classic", bidderKeepTrumps: 1,
      guardDiscards: 2, leadPartnerSuit: 1, aggression7: 0.25, aggression8: -0.25,
      ruffLow: 2, overtakePartner: 2, secondHandDuck: 1, noBossTrumpLead: 1,
      jokerDuck: 2, lateTrumpLead: 7,
    }),
  },
  tuned9: {
    describe: "tuned8 + misère defence that keeps low cards: play high when you must win the trick anyway or partner already beats the bidder, discard high, lead the bottom card of a suit the bidder holds",
    make: heur({
      aggression: -0.5, misereModel: "gap", misereDanger: 1, misereSlack: 1, opponentStrainPenalty: 1.5,
      secondHandRuff: true, discardMode: "eval", signalBid: 4, signalStrains: "all", partnerSupport: 1.5,
      stopAtWin: true, desperation: 1, behindScore: 300, behindAdjust: 1,
      estimateModel: "fit", discardModel: "classic", bidderKeepTrumps: 1,
      guardDiscards: 2, leadPartnerSuit: 1, aggression7: 0.25, aggression8: -0.25,
      ruffLow: 2, overtakePartner: 2, secondHandDuck: 1, noBossTrumpLead: 1,
      jokerDuck: 2, lateTrumpLead: 7, misereDef: 7,
    }),
  },
  tuned10: {
    describe: "tuned9 + misère bidder play: lead low from the shortest suit in tricks 1-3, discard the top card of the shortest suit",
    make: heur({
      aggression: -0.5, misereModel: "gap", misereDanger: 1, misereSlack: 1, opponentStrainPenalty: 1.5,
      secondHandRuff: true, discardMode: "eval", signalBid: 4, signalStrains: "all", partnerSupport: 1.5,
      stopAtWin: true, desperation: 1, behindScore: 300, behindAdjust: 1,
      estimateModel: "fit", discardModel: "classic", bidderKeepTrumps: 1,
      guardDiscards: 2, leadPartnerSuit: 1, aggression7: 0.25, aggression8: -0.25,
      ruffLow: 2, overtakePartner: 2, secondHandDuck: 1, noBossTrumpLead: 1,
      jokerDuck: 2, lateTrumpLead: 7, misereDef: 7, misereBid: 5,
    }),
  },
  tuned11: {
    describe: "tuned10 + the bidder draws trumps with its highest trump when it doesn't hold the top one",
    make: heur({
      aggression: -0.5, misereModel: "gap", misereDanger: 1, misereSlack: 1, opponentStrainPenalty: 1.5,
      secondHandRuff: true, discardMode: "eval", signalBid: 4, signalStrains: "all", partnerSupport: 1.5,
      stopAtWin: true, desperation: 1, behindScore: 300, behindAdjust: 1,
      estimateModel: "fit", discardModel: "classic", bidderKeepTrumps: 1,
      guardDiscards: 2, leadPartnerSuit: 1, aggression7: 0.25, aggression8: -0.25,
      ruffLow: 2, overtakePartner: 2, secondHandDuck: 1, noBossTrumpLead: 1,
      jokerDuck: 2, lateTrumpLead: 7, misereDef: 7, misereBid: 5, drawHigh: true,
    }),
  },
  tuned12: {
    describe: "tuned11 + defenders on lead from trick 3 with 1-2 trumps out lead a low trump, before cashing side winners",
    make: heur({
      aggression: -0.5, misereModel: "gap", misereDanger: 1, misereSlack: 1, opponentStrainPenalty: 1.5,
      secondHandRuff: true, discardMode: "eval", signalBid: 4, signalStrains: "all", partnerSupport: 1.5,
      stopAtWin: true, desperation: 1, behindScore: 300, behindAdjust: 1,
      estimateModel: "fit", discardModel: "classic", bidderKeepTrumps: 1,
      guardDiscards: 2, leadPartnerSuit: 1, aggression7: 0.25, aggression8: -0.25,
      ruffLow: 2, overtakePartner: 2, secondHandDuck: 1, noBossTrumpLead: 1,
      jokerDuck: 2, lateTrumpLead: 7, misereDef: 7, misereBid: 5, drawHigh: true,
      fewTrumpsLead: 3,
    }),
  },
  tuned13: {
    describe: "tuned12 + the bidding side stops leading trumps once both opponents are out (shown out, or dropped a trump that only a void hand would play)",
    make: heur({
      aggression: -0.5, misereModel: "gap", misereDanger: 1, misereSlack: 1, opponentStrainPenalty: 1.5,
      secondHandRuff: true, discardMode: "eval", signalBid: 4, signalStrains: "all", partnerSupport: 1.5,
      stopAtWin: true, desperation: 1, behindScore: 300, behindAdjust: 1,
      estimateModel: "fit", discardModel: "classic", bidderKeepTrumps: 1,
      guardDiscards: 2, leadPartnerSuit: 1, aggression7: 0.25, aggression8: -0.25,
      ruffLow: 2, overtakePartner: 2, secondHandDuck: 1, noBossTrumpLead: 1,
      jokerDuck: 2, lateTrumpLead: 7, misereDef: 7, misereBid: 5, drawHigh: true,
      fewTrumpsLead: 3, drawStopVoid: true, drawInferOut: 1,
    }),
  },
  tuned14: {
    describe: "tuned13 + no no-trump bids without an ace (the Joker alone does not count)",
    make: heur({
      aggression: -0.5, misereModel: "gap", misereDanger: 1, misereSlack: 1, opponentStrainPenalty: 1.5,
      secondHandRuff: true, discardMode: "eval", signalBid: 4, signalStrains: "all", partnerSupport: 1.5,
      stopAtWin: true, desperation: 1, behindScore: 300, behindAdjust: 1,
      estimateModel: "fit", discardModel: "classic", bidderKeepTrumps: 1,
      guardDiscards: 2, leadPartnerSuit: 1, aggression7: 0.25, aggression8: -0.25,
      ruffLow: 2, overtakePartner: 2, secondHandDuck: 1, noBossTrumpLead: 1,
      jokerDuck: 2, lateTrumpLead: 7, misereDef: 7, misereBid: 5, drawHigh: true,
      fewTrumpsLead: 3, drawStopVoid: true, drawInferOut: 1, ntMinAces: 1,
    }),
  },
  tuned15: {
    describe: "tuned14 + misère: the bidder doesn't discard cards that can never win; defenders count the open misère hand and don't lead into the bidder's voids",
    make: heur({
      aggression: -0.5, misereModel: "gap", misereDanger: 1, misereSlack: 1, opponentStrainPenalty: 1.5,
      secondHandRuff: true, discardMode: "eval", signalBid: 4, signalStrains: "all", partnerSupport: 1.5,
      stopAtWin: true, desperation: 1, behindScore: 300, behindAdjust: 1,
      estimateModel: "fit", discardModel: "classic", bidderKeepTrumps: 1,
      guardDiscards: 2, leadPartnerSuit: 1, aggression7: 0.25, aggression8: -0.25,
      ruffLow: 2, overtakePartner: 2, secondHandDuck: 1, noBossTrumpLead: 1,
      jokerDuck: 2, lateTrumpLead: 7, misereDef: 23, misereBid: 13, drawHigh: true,
      fewTrumpsLead: 3, drawStopVoid: true, drawInferOut: 1, ntMinAces: 1,
    }),
  },
  tuned16: {
    describe: "tuned15 + jump bids: bid straight to the highest level we would play, but no higher than the cheapest bid that wins the game",
    make: heur({
      aggression: -0.5, misereModel: "gap", misereDanger: 1, misereSlack: 1, opponentStrainPenalty: 1.5,
      secondHandRuff: true, discardMode: "eval", signalBid: 4, signalStrains: "all", partnerSupport: 1.5,
      stopAtWin: true, desperation: 1, behindScore: 300, behindAdjust: 1,
      estimateModel: "fit", discardModel: "classic", bidderKeepTrumps: 1,
      guardDiscards: 2, leadPartnerSuit: 1, aggression7: 0.25, aggression8: -0.25,
      ruffLow: 2, overtakePartner: 2, secondHandDuck: 1, noBossTrumpLead: 1,
      jokerDuck: 2, lateTrumpLead: 7, misereDef: 23, misereBid: 13, drawHigh: true,
      fewTrumpsLead: 3, drawStopVoid: true, drawInferOut: 1, ntMinAces: 1, jump: true, jumpToWin: true,
    }),
  },
  tuned17: {
    describe: "tuned16 + stop drawing trumps when one is out and partner bid the trump suit: it's probably partner's",
    make: heur({
      aggression: -0.5, misereModel: "gap", misereDanger: 1, misereSlack: 1, opponentStrainPenalty: 1.5,
      secondHandRuff: true, discardMode: "eval", signalBid: 4, signalStrains: "all", partnerSupport: 1.5,
      stopAtWin: true, desperation: 1, behindScore: 300, behindAdjust: 1,
      estimateModel: "fit", discardModel: "classic", bidderKeepTrumps: 1,
      guardDiscards: 2, leadPartnerSuit: 1, aggression7: 0.25, aggression8: -0.25,
      ruffLow: 2, overtakePartner: 2, secondHandDuck: 1, noBossTrumpLead: 1,
      jokerDuck: 2, lateTrumpLead: 7, misereDef: 23, misereBid: 13, drawHigh: true,
      fewTrumpsLead: 3, drawStopVoid: true, drawInferOut: 1, ntMinAces: 1, jump: true, jumpToWin: true, drawPartnerHolds: 1,
    }),
  },
  tuned18: {
    describe: "tuned17 + defenders win an opponent's top trump lead with the Joker (still keeping it under lower trumps)",
    make: heur({
      aggression: -0.5, misereModel: "gap", misereDanger: 1, misereSlack: 1, opponentStrainPenalty: 1.5,
      secondHandRuff: true, discardMode: "eval", signalBid: 4, signalStrains: "all", partnerSupport: 1.5,
      stopAtWin: true, desperation: 1, behindScore: 300, behindAdjust: 1,
      estimateModel: "fit", discardModel: "classic", bidderKeepTrumps: 1,
      guardDiscards: 2, leadPartnerSuit: 1, aggression7: 0.25, aggression8: -0.25,
      ruffLow: 2, overtakePartner: 2, secondHandDuck: 1, noBossTrumpLead: 1,
      jokerDuck: 3, lateTrumpLead: 7, misereDef: 23, misereBid: 13, drawHigh: true,
      fewTrumpsLead: 3, drawStopVoid: true, drawInferOut: 1, ntMinAces: 1, jump: true, jumpToWin: true, drawPartnerHolds: 1,
    }),
  },
  tuned19: {
    describe: "tuned18 + ruff partner's winning side card only with the lowest trump that wins; cash side winners from the top (A before K)",
    make: heur({
      aggression: -0.5, misereModel: "gap", misereDanger: 1, misereSlack: 1, opponentStrainPenalty: 1.5,
      secondHandRuff: true, discardMode: "eval", signalBid: 4, signalStrains: "all", partnerSupport: 1.5,
      stopAtWin: true, desperation: 1, behindScore: 300, behindAdjust: 1,
      estimateModel: "fit", discardModel: "classic", bidderKeepTrumps: 1,
      guardDiscards: 2, leadPartnerSuit: 1, aggression7: 0.25, aggression8: -0.25,
      ruffLow: 2, overtakePartner: 2, secondHandDuck: 1, noBossTrumpLead: 1,
      jokerDuck: 3, lateTrumpLead: 7, misereDef: 23, misereBid: 13, drawHigh: true,
      fewTrumpsLead: 3, drawStopVoid: true, drawInferOut: 1, ntMinAces: 1, jump: true, jumpToWin: true, drawPartnerHolds: 1, partnerRuff: 2, cashTop: true,
    }),
  },
  tuned20: {
    describe: "tuned19 + partner support split by level: 1.25 when partner's bid in the strain was at 6, 1.75 when higher",
    make: heur({
      aggression: -0.5, misereModel: "gap", misereDanger: 1, misereSlack: 1, opponentStrainPenalty: 1.5,
      secondHandRuff: true, discardMode: "eval", signalBid: 4, signalStrains: "all", partnerSupport: 1.75,
      stopAtWin: true, desperation: 1, behindScore: 300, behindAdjust: 1,
      estimateModel: "fit", discardModel: "classic", bidderKeepTrumps: 1,
      guardDiscards: 2, leadPartnerSuit: 1, aggression7: 0.25, aggression8: -0.25,
      ruffLow: 2, overtakePartner: 2, secondHandDuck: 1, noBossTrumpLead: 1,
      jokerDuck: 3, lateTrumpLead: 7, misereDef: 23, misereBid: 13, drawHigh: true,
      fewTrumpsLead: 3, drawStopVoid: true, drawInferOut: 1, ntMinAces: 1, jump: true, jumpToWin: true, drawPartnerHolds: 1, partnerRuff: 2, cashTop: true, partnerSupport6: 1.25,
    }),
  },
  sim: {
    describe: "simulation card play (worlds=N, voids=bool, infer=bool, tries=N, tol=N, endgame=N, policy=name); bids, discards and rollouts use `policy` (default tuned)",
    make: (o) => {
      const policy = String(o.policy ?? "tuned");
      if (!STRATEGIES[policy] || policy === "sim") throw new Error(`Bad sim policy ${policy}`);
      const t = STRATEGIES[policy].make({});
      const sim = simulationStrategy({
        worlds: Number(o.worlds ?? 40), rollout: t, base: t, respectVoids: o.voids !== false,
        infer: o.infer !== false, tries: Number(o.tries ?? 20), endgame: Number(o.endgame ?? 0),
        objective: o.objective === "win" ? "win" : "points",
        inference: {
          ...(o.imodel === "fit" ? FIT_INFERENCE : DEFAULT_INFERENCE),
          ...(o.tol !== undefined ? { tolerance: Number(o.tol) } : {}),
          ...(o.extra !== undefined ? { assumedExtra: Number(o.extra) } : {}),
        },
      });
      if (o.forceCash !== true) return sim;
      // Experiment: as a defender on lead in the first 4 tricks, always cash a side winner.
      return {
        ...sim,
        play(v) {
          if (v.ledSuit === null && v.tricks.length < 4 && !v.contract.misere && teamOf(v.seat) !== teamOf(v.contract.bidder)) {
            const unseen = unseenCards(v);
            const boss = v.legal.filter((x) => x !== "JK" && !isTrump(x, v.contract.trump) && isBoss(x, v, unseen));
            if (boss.length) return boss[0];
          }
          return sim.play(v);
        },
      };
    },
  },
  nomisere: { describe: "heuristic, never bids misère", make: heur({ misereDanger: -1, openMisereDanger: -1 }) },
};

export function makeStrategy(spec: string): Strategy {
  const [name, paramStr] = spec.split(":");
  const entry = STRATEGIES[name];
  if (!entry) throw new Error(`Unknown strategy "${name}". Known: ${Object.keys(STRATEGIES).join(", ")}`);
  const overrides: Record<string, number | boolean | string> = {};
  for (const kv of (paramStr ?? "").split(",").filter(Boolean)) {
    const [k, v] = kv.split("=");
    overrides[k] = v === "true" ? true : v === "false" ? false : Number.isNaN(Number(v)) ? v : Number(v);
  }
  const s = entry.make(overrides);
  s.name = spec;
  return s;
}
