// Client side of the answer API. The browser sends the units it has guessed and
// gets back per-cell feedback; it never receives the answer until it has won.

import type { Cell } from './compare';
import type { Unit } from './units';

export type Mode = 'daily' | 'challenge';

export interface DailyState {
  puzzleNumber: number;
  mode: Mode;
  solved: boolean;
  hidden: string[];
  rows: Cell[][];
  answer: Unit | null;
  reveal: {
    hidden: string[];
    liar: string;
    /** Per-guess, the liar column cell the game showed during play (the lie). */
    lieCells: Cell[];
    /** The answer's faked value for the liar column, formatted for display. */
    shown: string;
    /** The answer's real value for the liar column, formatted for display. */
    real: string;
  } | null;
}

export async function fetchDailyState(mode: Mode, guesses: string[]): Promise<DailyState> {
  const res = await fetch('/api/daily/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, guesses }),
  });
  if (!res.ok) throw new Error(`state request failed: ${res.status}`);
  return (await res.json()) as DailyState;
}
