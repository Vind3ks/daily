// Server-authoritative answer resolution. This is the whole point of moving
// off the client: the daily/challenge pick is a function of the date AND a
// server-only secret, so nobody can recompute today's (or any future day's)
// answer from the shipped bundle, the unit list, or this source.

import { UNITS, findById, type Unit } from '../src/lib/units';
import { mulberry32, dayNumberOf, todayKey } from '../src/lib/daily';

export type Mode = 'daily' | 'challenge';

// Hand-picked answers for specific UTC dates, overriding the algorithm (daily
// only — the challenge stream is independent).
const DAILY_OVERRIDES: Record<string, string> = {
  '2026-07-11': 'DRLK005', // Crab Egg (Bouncer)
};

// A unit can't be picked again within this many days (prevents near-term
// repeats without becoming a predictable full cycle).
const AVOID_RECENT_DAYS = 90;

// 32-bit FNV-1a of the secret, folded into every seed. Changing the secret
// reshuffles the entire schedule; keeping it stable keeps answers stable.
export function secretHash(secret: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < secret.length; i++) {
    h ^= secret.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function dailySeed(day: number, salt: number): () => number {
  return mulberry32((Math.imul(day + 1, 2654435761) ^ 0x9e3779b9 ^ salt) >>> 0);
}
function challengeSeed(day: number, salt: number): () => number {
  return mulberry32((Math.imul(day + 1, 2246822519) ^ 0x85ebca6b ^ salt) >>> 0);
}

// Build the pick sequence [day 0 .. dayNumber], applying the recency window.
// `blocked(day, pick)` can veto extra values (the challenge uses it to never
// reuse that day's daily answer). Cheap: a few ms even years past the epoch.
function pickSeq(
  poolLen: number,
  dayNumber: number,
  seedFor: (day: number) => () => number,
  blocked?: (day: number, pick: number) => boolean
): number[] {
  const window = Math.min(AVOID_RECENT_DAYS, poolLen - 1);
  const recent: number[] = [];
  const recentSet = new Set<number>();
  const out: number[] = [];

  for (let day = 0; day <= dayNumber; day++) {
    const rnd = seedFor(day);
    let pick = Math.floor(rnd() * poolLen);
    for (
      let attempt = 0;
      attempt < 64 && (recentSet.has(pick) || (blocked ? blocked(day, pick) : false));
      attempt++
    ) {
      pick = Math.floor(rnd() * poolLen);
    }
    out.push(pick);
    recent.push(pick);
    recentSet.add(pick);
    if (recent.length > window) recentSet.delete(recent.shift() as number);
  }
  return out;
}

// The unit for a given mode/date. `secret` salts the streams.
export function resolveAnswer(mode: Mode, date: Date, secret: string): Unit {
  const salt = secretHash(secret);
  const dayNumber = dayNumberOf(date);
  const daily = pickSeq(UNITS.length, dayNumber, (d) => dailySeed(d, salt));

  if (mode === 'daily') {
    const forced = DAILY_OVERRIDES[todayKey(date)];
    const override = forced ? findById(forced) : undefined;
    return override ?? UNITS[daily[dayNumber]];
  }

  const challenge = pickSeq(
    UNITS.length,
    dayNumber,
    (d) => challengeSeed(d, salt),
    (day, pick) => pick === daily[day]
  );
  return UNITS[challenge[dayNumber]];
}
