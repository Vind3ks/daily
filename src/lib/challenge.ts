import type { Unit } from './units';
import { UNITS } from './units';
import { COLUMNS } from './compare';
import { dayRng } from './daily';

// The daily-challenge twist: for a given UTC date, two attribute columns are
// hidden (no clue given) and one visible column lies (its comparison is run
// against a decoy value borrowed from another unit). Everything here is a pure
// function of the date + the answer, so every player sees the same challenge
// and it survives a refresh without needing to be stored.

export interface ChallengeConfig {
  /** Two column keys whose cells are masked. */
  hidden: string[];
  /** One visible column key whose comparison is based on the decoy value. */
  liar: string;
  /** { [liar]: decoyValue } borrowed from another unit, injected into the answer. */
  decoy: Record<string, unknown>;
}

const KIND = new Map(COLUMNS.map((c) => [c.key as string, c.kind]));
const KEYS = COLUMNS.map((c) => c.key as string);

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

export function challengeConfig(answer: Unit, d = new Date()): ChallengeConfig {
  const order = shuffle(dayRng(d, 3), KEYS);
  const hidden = [order[0], order[1]];
  const rest = order.slice(2); // the 9 columns that stay visible

  // Choose the liar among the visible columns: first (in a seeded order) that
  // has at least one other unit whose value is a genuine lie.
  let liar = rest[0];
  let decoyUnit: Unit | undefined;
  for (const key of shuffle(dayRng(d, 5), rest)) {
    const cands = UNITS.filter(
      (u) => u.id !== answer.id && isLie(KIND.get(key), pluck(u, key), pluck(answer, key))
    );
    if (cands.length) {
      liar = key;
      decoyUnit = cands[Math.floor(dayRng(d, 7)() * cands.length)];
      break;
    }
  }

  const source = decoyUnit ?? answer; // fallback never hit with the real dataset
  // The tech column reads two fields (the tech label for the match, techRank for
  // the arrow), so a tech lie must borrow both from the same decoy - otherwise
  // the arrow keeps telling the truth and contradicts the fake label (and quietly
  // leaks the real tech). Every other column reads a single field.
  const decoy: Record<string, unknown> =
    liar === 'tech'
      ? { tech: pluck(source, 'tech'), techRank: pluck(source, 'techRank') }
      : { [liar]: pluck(source, liar) };
  return { hidden, liar, decoy };
}

// Human labels for a set of column keys, returned in COLUMNS order.
export function columnLabels(keys: string[]): string[] {
  return COLUMNS.filter((c) => keys.includes(c.key as string)).map((c) => c.label);
}
