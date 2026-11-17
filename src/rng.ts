// Small seeded random number generator, so every deal and every game is reproducible.

export type Rng = () => number; // returns a float in [0, 1)

/** mulberry32: fast, decent-quality 32-bit PRNG. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derive an independent seed from a base seed and an index (e.g. deal number). */
export function deriveSeed(base: number, index: number, salt = 0): number {
  let h = (base ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (index + 0x85ebca6b), 0xc2b2ae35) >>> 0;
  h = Math.imul(h ^ (salt + 0x27d4eb2f), 0x165667b1) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick<T>(items: T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}
