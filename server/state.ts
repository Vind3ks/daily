// Turn a (mode, list of guessed unit ids) into everything the board needs to
// render — computed against the hidden answer here, so the browser only ever
// receives per-cell feedback, never the answer (until the player has won).

import { COLUMNS, compareColumn, compareRow, type Cell } from '../src/lib/compare';
import { challengeConfig } from './challenge';
import { findById, type Unit } from '../src/lib/units';
import { puzzleNumber } from '../src/lib/daily';
import { resolveAnswer, type Mode } from './answer';

export interface DailyState {
  puzzleNumber: number;
  mode: Mode;
  solved: boolean;
  /** Column keys hidden this round (challenge, while unsolved). */
  hidden: string[];
  /** Per-guess comparison cells, in the same order as the guesses sent. */
  rows: Cell[][];
  /** Full answer unit — only present once solved. */
  answer: Unit | null;
  /** Challenge post-solve reveal — only present once a challenge is solved. */
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

// Hidden challenge cells are blanked so their real state never leaves the
// server; the client draws a lock for these columns anyway.
const MASK: Cell = { state: 'miss', text: '' };

// Format a column value for the reveal text (the faked value vs the real one).
function describeValue(kind: string, value: unknown): string {
  if (Array.isArray(value)) {
    const items = (value as string[]).filter((x) => x && x !== 'None');
    return items.length ? items.join(', ') : '—';
  }
  if (kind === 'num') return Number(value).toLocaleString('en-US');
  return String(value);
}

export function buildState(mode: Mode, date: Date, ids: string[], secret: string): DailyState {
  const answer = resolveAnswer(mode, date, secret);
  const guesses = ids.map(findById).filter((u): u is Unit => !!u);
  const solved = guesses.some((g) => g.id === answer.id);
  const base = { puzzleNumber: puzzleNumber(date), mode, solved };

  if (mode === 'challenge') {
    const cfg = challengeConfig(answer, date, secret);
    if (solved) {
      // Reveal the truth: honest board, plus which column lied (with the value it
      // faked vs the real one) and, per guess, the cell the lie had shown.
      const distorted = { ...answer, ...cfg.decoy } as Unit;
      const liarCol = COLUMNS.find((c) => String(c.key) === cfg.liar)!;
      const lieCells = guesses.map((g) => compareColumn(liarCol, g, distorted));
      return {
        ...base,
        hidden: [],
        rows: guesses.map((g) => compareRow(g, answer)),
        answer,
        reveal: {
          hidden: cfg.hidden,
          liar: cfg.liar,
          lieCells,
          shown: describeValue(liarCol.kind, cfg.decoy[cfg.liar]),
          real: describeValue(liarCol.kind, (answer as unknown as Record<string, unknown>)[cfg.liar]),
        },
      };
    }
    // While playing: compare against the decoy-injected answer (so the liar
    // column shows a real-looking but wrong result) and blank the hidden columns.
    const distorted = { ...answer, ...cfg.decoy } as Unit;
    const hiddenSet = new Set(cfg.hidden);
    const rows = guesses.map((g) =>
      compareRow(g, distorted).map((c, i) => (hiddenSet.has(String(COLUMNS[i].key)) ? MASK : c))
    );
    return { ...base, hidden: cfg.hidden, rows, answer: null, reveal: null };
  }

  // daily: honest per-cell feedback; the answer identity is only handed over on
  // a win (the winning guess is itself the answer).
  return {
    ...base,
    hidden: [],
    rows: guesses.map((g) => compareRow(g, answer)),
    answer: solved ? answer : null,
    reveal: null,
  };
}
