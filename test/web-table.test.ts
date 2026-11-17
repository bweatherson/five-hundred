import { describe, expect, it } from "vitest";
import { Table } from "../web/src/game/table.ts";

// Drive the web app's step-by-step table with the computer in every seat, through
// whole games: auctions, redeals, kitty, tricks and scoring.
describe("web table controller", () => {
  it("plays complete games to a winner", () => {
    for (let g = 0; g < 6; g++) {
      const t = new Table("tuned12", 1000 + g);
      let steps = 0;
      let hands = 0;
      while (t.phase !== "gameEnd" && steps < 200000) {
        steps++;
        if (t.phase === "trickEnd") t.collectTrick();
        else if (t.phase === "redeal") t.redeal();
        else if (t.phase === "handEnd") {
          const s = t.summary!;
          expect(s.tricks[0] + s.tricks[1]).toBe(10);
          hands++;
          t.nextHand();
        } else t.aiStep(true);
        if (t.phase === "play") {
          // Every card is in an active hand, on the table, or in a finished trick.
          const active = t.play!.contract.misere ? 3 : 4;
          const inHands = t.hands.reduce((n, h, seat) => n + (t.sittingOut(seat) ? 0 : h.length), 0);
          expect(inHands + t.play!.current.length + t.play!.tricks.length * active).toBe(10 * active);
        }
      }
      expect(t.phase).toBe("gameEnd");
      expect(hands).toBeGreaterThan(0);
      expect(t.gameWinner === 0 || t.gameWinner === 1).toBe(true);
    }
  });
});

describe("web table with two people", () => {
  it("records reviews, hides other hands in snapshots, and waits for everyone to be ready", () => {
    const t = new Table("tuned12", 77);
    t.humans = [true, false, true, false];
    let handsDone = 0;
    for (let steps = 0; steps < 20000 && handsDone < 3; steps++) {
      const seat = t.actor();
      if (t.phase === "trickEnd") t.collectTrick();
      else if (t.phase === "redeal") t.redeal();
      else if (t.phase === "handEnd") {
        // Everyone's review is about their own seat, and covers every choice they had.
        expect(t.review.every((r) => r.seat === 0 || r.seat === 2)).toBe(true);
        expect(t.review.some((r) => r.kind === "play")).toBe(true);
        for (const seat of [0, 2]) {
          const snap = t.snapshot(seat);
          expect(snap.review.every((r) => r.seat === seat)).toBe(true);
        }
        t.markReady(0);
        expect(t.phase).toBe("handEnd");
        expect(t.waitingFor()).toEqual([2]);
        t.markReady(2);
        expect(t.phase).toBe("auction");
        handsDone++;
      } else if (seat !== null && t.humans[seat]) {
        // A person's move: always the first legal option.
        if (t.phase === "auction") t.bid(seat, t.legalBids()[0] ?? null);
        else if (t.phase === "discard") t.discard(t.hands[seat].slice(0, 3));
        else t.playCard(seat, t.legalPlays(seat)[0], "S");
      } else t.aiStep();

      if (t.phase === "play" || t.phase === "auction") {
        const snap = t.snapshot(0);
        const exposed = t.contract?.open && t.play ? t.contract.bidder : -1;
        for (const s of [1, 2, 3]) {
          if (s === exposed) continue;
          expect(snap.hands[s].every((c) => c === "??")).toBe(true);
          expect(snap.hands[s].length).toBe(t.hands[s].length);
        }
        expect(snap.hands[0]).toEqual(t.hands[0]);
        const copy = Table.fromSnapshot(JSON.parse(JSON.stringify(snap)));
        expect(copy.actor()).toBe(t.actor());
      }
    }
    expect(handsDone).toBe(3);
  });
});
