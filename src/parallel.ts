// Split a duplicate-hands match across several processes.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { HandsMatchResult, SideStats, meanCI, mergeStats } from "./tournament.ts";

const SHARD = fileURLToPath(new URL("./shard.ts", import.meta.url));
const TSX = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));

function runShard(args: string[]): Promise<{ diffs: number[]; a: SideStats; b: SideStats }> {
  return new Promise((resolve, reject) => {
    const p = spawn(TSX, [SHARD, ...args], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`shard exited with ${code}`));
      const j = JSON.parse(out);
      const de = (s: any): SideStats => ({ ...s, byBid: new Map(s.byBid) });
      resolve({ diffs: j.diffs, a: de(j.a), b: de(j.b) });
    });
  });
}

export async function parallelDuplicateHands(
  aSpec: string, bSpec: string, deals: number, seed: number, jobs: number, mode: "points" | "win" | "near" = "points",
): Promise<HandsMatchResult> {
  const per = Math.ceil(deals / jobs);
  const parts = await Promise.all(
    Array.from({ length: jobs }, (_, k) => {
      const from = k * per;
      const count = Math.max(0, Math.min(per, deals - from));
      return runShard([aSpec, bSpec, String(from), String(count), String(seed), mode]);
    }),
  );
  const diffs = parts.flatMap((p) => p.diffs);
  return { diff: meanCI(diffs), diffs, a: mergeStats(parts.map((p) => p.a)), b: mergeStats(parts.map((p) => p.b)) };
}
