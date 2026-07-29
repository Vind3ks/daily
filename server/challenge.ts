// Server-only challenge selection. Which two columns are hidden and which one
// lies is decided here and folded into the same server secret that salts the
// answer, so it cannot be reproduced from the public repo or the shipped bundle
// by reading the date. The browser only ever learns the hidden column KEYS (to
// draw locks) and, once solved, the reveal.

import { UNITS, type Unit } from '../src/lib/units';
import { COLUMNS } from '../src/lib/compare';
import { mulberry32, dayNumberOf } from '../src/lib/daily';
import { secretHash } from './answer';

export interface ChallengeConfig {
  /** Two column keys whose cells are masked. */
  hidden: string[];
  /** One visible column key whose comparison is based on the decoy value. */
  liar: string;
  /** { [liar]: decoyValue } borrowed from another unit, injected into the answer. */
  decoy: Record<string, unknown>;
}

const KIND = new Map(COLUMNS.map((c) => [String(c.key), c.kind]));
const KEYS = COLUMNS.map((c) => String(c.key));

// numbers within this fraction read as "close" in compare.ts; a numeric lie
// must land outside it to actually mislead.
const CLOSE = 0.2;

function pluck(u: Unit, key: string): unknown {
  return (u as unknown as Record<string, unknown>)[key];
}

function setsDiffer(a: string[], b: string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return true;
  for (const x of sa) if (!sb.has(x)) return true;
  return false;
}

// Is `decoyVal` a meaningful lie relative to `trueVal` for a column of `kind`?
function isLie(kind: string | undefined, decoyVal: unknown, trueVal: unknown): boolean {
  if (kind === 'set') return setsDiffer(decoyVal as string[], trueVal as string[]);
  if (kind === 'num') {
    const d = decoyVal as number;
    const t = trueVal as number;
    return t > 0 ? Math.abs(d - t) / t > CLOSE : d !== t;
  }
  return decoyVal !== trueVal; // cat / tech
}

// Deterministic Fisher-Yates shuffle driven by a seeded RNG.
function shuffle<T>(rng: () => number, arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Per-day, per-salt RNG folded with the secret hash `h`. Stable for everyone on
// a given UTC day, but not reproducible without the secret.
function rng(day: number, salt: number, h: number): () => number {
  return mulberry32(
    (Math.imul(day + 1, 2166136261) ^ Math.imul(salt + 1, 3266489917) ^ 0x27d4eb2f ^ h) >>> 0
  );
}

export function challengeConfig(answer: Unit, date: Date, secret: string): ChallengeConfig {
  const h = secretHash(secret);
  const day = dayNumberOf(date);

  const order = shuffle(rng(day, 3, h), KEYS);
  const hidden = [order[0], order[1]];
  const rest = order.slice(2); // the 9 columns that stay visible

  // Choose the liar among the visible columns: first (in a seeded order) that
  // has at least one other unit whose value is a genuine lie.
  let liar = rest[0];
  let decoyUnit: Unit | undefined;
  for (const key of shuffle(rng(day, 5, h), rest)) {
    const cands = UNITS.filter(
      (u) => u.id !== answer.id && isLie(KIND.get(key), pluck(u, key), pluck(answer, key))
    );
    if (cands.length) {
      liar = key;
      decoyUnit = cands[Math.floor(rng(day, 7, h)() * cands.length)];
      break;
    }
  }

  const source = decoyUnit ?? answer; // fallback never hit with the real dataset
  // The tech column reads two fields - the tech label for the match and techRank
  // for the arrow - so a tech lie must borrow BOTH from the same decoy, or the
  // arrow (from the real rank) contradicts the fake label and gives it away.
  const decoy =
    liar === 'tech'
      ? { tech: pluck(source, 'tech'), techRank: pluck(source, 'techRank') }
      : { [liar]: pluck(source, liar) };
  return { hidden, liar, decoy };
}
