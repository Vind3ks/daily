import type { Unit } from './units';

export type CellState = 'hit' | 'partial' | 'miss';

export interface Cell {
  state: CellState;
  text: string;
  arrow?: '↑' | '↓';
  /** For multi-value (set) columns: the individual values, rendered as tags. */
  list?: string[];
}

type ColumnKind = 'cat' | 'set' | 'num' | 'tech';

export interface Column {
  key: keyof Unit;
  label: string;
  kind: ColumnKind;
}

// Order of attribute columns shown in the guess grid.
export const COLUMNS: Column[] = [
  { key: 'faction', label: 'Faction', kind: 'cat' },
  { key: 'tech', label: 'Tech', kind: 'tech' },
  { key: 'type', label: 'Type', kind: 'cat' },
  { key: 'domain', label: 'Domain', kind: 'cat' },
  { key: 'weapon', label: 'Weapon', kind: 'set' },
  // "Yields" (not "Produces") — this is resource output; factories produce units,
  // which was confusing people.
  { key: 'produces', label: 'Yields', kind: 'set' },
  { key: 'role', label: 'Role', kind: 'set' },
  { key: 'mass', label: 'Mass', kind: 'num' },
  { key: 'hp', label: 'HP', kind: 'num' },
  { key: 'buildTime', label: 'Build Time', kind: 'num' },
  { key: 'abilities', label: 'Abilities', kind: 'set' },
];

// numbers within this fraction of the answer get a "close" (amber) cell
const CLOSE = 0.2;

function num(n: number): string {
  return n >= 10000 ? `${Math.round(n / 1000)}k` : n.toLocaleString('en-US');
}

function setText(arr: string[]): string {
  return arr.length ? arr.join(', ') : '—';
}

function compareSet(g: string[], a: string[]): Cell {
  const gs = new Set(g.filter((x) => x !== 'None'));
  const as = new Set(a.filter((x) => x !== 'None'));
  const sameSize = gs.size === as.size;
  let allIn = sameSize;
  gs.forEach((x) => { if (!as.has(x)) allIn = false; });
  if (allIn && (gs.size > 0 || (g.includes('None') && a.includes('None')))) {
    return { state: 'hit', text: setText(g), list: g };
  }
  let overlap = false;
  gs.forEach((x) => { if (as.has(x)) overlap = true; });
  return { state: overlap ? 'partial' : 'miss', text: setText(g), list: g };
}

function compareNum(g: number, a: number): Cell {
  if (g === a) return { state: 'hit', text: num(g) };
  const arrow: '↑' | '↓' = a > g ? '↑' : '↓';
  const close = a !== 0 && Math.abs(g - a) / a <= CLOSE;
  return { state: close ? 'partial' : 'miss', text: num(g), arrow };
}

// Domains that share a movement layer count as a partial (amber) match: Land,
// Hover and Amphibious all traverse land; Naval and Amphibious both go in water.
const DOMAIN_GROUPS = [
  ['Land', 'Hover', 'Amphibious'],
  ['Naval', 'Amphibious'],
];
function domainsRelated(a: string, b: string): boolean {
  return DOMAIN_GROUPS.some((g) => g.includes(a) && g.includes(b));
}

export function compareColumn(col: Column, guess: Unit, answer: Unit): Cell {
  if (col.kind === 'set') {
    return compareSet(guess[col.key] as string[], answer[col.key] as string[]);
  }
  if (col.kind === 'num') {
    return compareNum(guess[col.key] as number, answer[col.key] as number);
  }
  if (col.kind === 'tech') {
    if (guess.tech === answer.tech) return { state: 'hit', text: guess.tech };
    return { state: 'miss', text: guess.tech, arrow: answer.techRank > guess.techRank ? '↑' : '↓' };
  }
  if (col.key === 'domain') {
    const g = guess.domain;
    const a = answer.domain;
    if (g === a) return { state: 'hit', text: g };
    return { state: domainsRelated(g, a) ? 'partial' : 'miss', text: g };
  }
  // categorical
  const gv = String(guess[col.key]);
  return { state: gv === String(answer[col.key]) ? 'hit' : 'miss', text: gv };
}

export function compareRow(guess: Unit, answer: Unit): Cell[] {
  return COLUMNS.map((c) => compareColumn(c, guess, answer));
}

const EMOJI: Record<CellState, string> = { hit: '🟩', partial: '🟨', miss: '🟥' };

export function rowEmoji(cells: Cell[]): string {
  return cells.map((c) => EMOJI[c.state]).join('');
}

// Human labels for a set of column keys, returned in COLUMNS order.
export function columnLabels(keys: string[]): string[] {
  return COLUMNS.filter((c) => keys.includes(String(c.key))).map((c) => c.label);
}
