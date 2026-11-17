import { describe, expect, it } from "vitest";
import { fittedTricks, ntFeatures, NT_FEATURES, suitFeatures, SUIT_FEATURES } from "../src/strategies/features.ts";
import { estimateTricks } from "../src/strategies/heuristic.ts";
import { makeStrategy } from "../src/registry.ts";
import { duplicateHands } from "../src/tournament.ts";

describe("fitted trick estimate", () => {
  const hand = ["JH", "JD", "AH", "KH", "7H", "AS", "9S", "6C", "5C", "8D"];

  it("feature vectors match their names", () => {
    expect(suitFeatures(hand, "H").length).toBe(SUIT_FEATURES.length);
    expect(ntFeatures(hand).length).toBe(NT_FEATURES.length);
  });

  it("values top trumps and rises when the Joker is added", () => {
    const withJoker = [...hand.slice(0, 9), "JK"];
    expect(fittedTricks(withJoker, "H")).toBeGreaterThan(fittedTricks(hand, "H"));
    expect(fittedTricks(hand, "H")).toBeGreaterThan(fittedTricks(hand, "S"));
  });

  it("estimateTricks('fit') is the side prediction less 2", () => {
    expect(estimateTricks(hand, "H", "fit")).toBeCloseTo(fittedTricks(hand, "H") - 2, 9);
  });
});

describe("tuned4 and void-aware options", () => {
  it("tuned4 and the void options play legal hands", () => {
    const a = makeStrategy("tuned4:ruffAwareBoss=3,avoidBidderVoid=100,avoidPartnerVoid=2");
    const r = duplicateHands(a, makeStrategy("tuned3"), 30, 5);
    expect(r.diffs.length).toBe(30);
  });

  it("tuned6 and the near-500 / defence options play legal hands", () => {
    const a = makeStrategy("tuned6:raiseToStop=1,avoidPartnerDiscards=2,leadPartnerSuit=2");
    const r = duplicateHands(a, makeStrategy("tuned5:bidderKeepTrumps=2,bidderKeepMinOut=2"), 30, 6);
    expect(r.diffs.length).toBe(30);
  });

  it("tuned7 and the probe-derived options play legal hands", () => {
    const a = makeStrategy("tuned7");
    const r = duplicateHands(a, makeStrategy("tuned6:ruffLow=1,overtakePartner=1,secondHandDuck=2,noBossTrumpLead=2"), 30, 7);
    expect(r.diffs.length).toBe(30);
  });

  it("tuned8 (Joker duck, late trump lead) plays legal hands", () => {
    const r = duplicateHands(makeStrategy("tuned8"), makeStrategy("tuned7:jokerDuck=1,lateTrumpLead=8"), 30, 8);
    expect(r.diffs.length).toBe(30);
  });

  it("tuned9 misère defence plays legal hands", () => {
    const r = duplicateHands(makeStrategy("tuned9"), makeStrategy("tuned8:misereDef=8"), 60, 9);
    expect(r.diffs.length).toBe(60);
  });

  it("tuned10 misère bidder play plays legal hands", () => {
    const r = duplicateHands(makeStrategy("tuned10"), makeStrategy("tuned9:misereBid=2"), 60, 10);
    expect(r.diffs.length).toBe(60);
  });

  it("tuned11 (draw high) and partnerJoker play legal hands", () => {
    const r = duplicateHands(makeStrategy("tuned11"), makeStrategy("tuned10:partnerJoker=true"), 30, 11);
    expect(r.diffs.length).toBe(30);
  });

  it("tuned12 (defenders lead a trump with 1-2 out) plays legal hands", () => {
    const r = duplicateHands(makeStrategy("tuned12"), makeStrategy("tuned11:fewTrumpsLead=5,fewTrumpsMode=6"), 30, 12);
    expect(r.diffs.length).toBe(30);
  });
});
