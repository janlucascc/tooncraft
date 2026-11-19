/**
 * Deterministic pseudo-random generator (Mulberry32).
 *
 * Every procedural effect (speedlines, rain, starbursts, cracks…) draws from a
 * PRNG seeded by the panel's `seed`, so preview and export are pixel-identical
 * and re-renders are reproducible.
 */
export interface Prng {
  /** Float in [0, 1). */
  next(): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  /** Random element of a non-empty array. */
  pick<T>(arr: readonly T[]): T;
  /** True with probability p. */
  chance(p: number): boolean;
  /** Derive an independent child generator (stable per label). */
  fork(label: string | number): Prng;
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createPrng(seed: number | string): Prng {
  let state = (typeof seed === 'string' ? hashString(seed) : seed >>> 0) || 0x9e3779b9;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const baseSeed = state;

  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    pick: <T>(arr: readonly T[]): T => {
      if (arr.length === 0) throw new Error('prng.pick: empty array');
      return arr[Math.floor(next() * arr.length)] as T;
    },
    chance: (p) => next() < p,
    fork: (label) => createPrng((baseSeed ^ hashString(String(label))) >>> 0),
  };
}

/** Alias kept for readability in docs: `seededRange(prng, min, max)`. */
export const seededRange = (prng: Prng, min: number, max: number): number =>
  prng.range(min, max);

/** Alias kept for readability in docs: `seededPick(prng, arr)`. */
export const seededPick = <T>(prng: Prng, arr: readonly T[]): T => prng.pick(arr);
