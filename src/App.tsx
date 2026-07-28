import { useCallback, useEffect, useMemo, useState } from 'react';
import { Share2, Clock, Copy, Swords, ChevronLeft, Lock } from 'lucide-react';
import { UNITS, findById } from './lib/units';
import type { Unit } from './lib/units';
import {
  dailyIndex,
  challengeIndex,
  todayKey,
  puzzleNumber,
  msUntilNextUTCDay,
  formatCountdown,
} from './lib/daily';
import { challengeConfig, columnLabels } from './lib/challenge';
import type { ChallengeConfig } from './lib/challenge';
import { buildShareImage } from './lib/shareImage';
import { Search } from './components/Search';
import { GuessGrid } from './components/GuessGrid';
import { UnitIcon } from './components/UnitIcon';

type Mode = 'daily' | 'challenge';

const STORE_KEY = 'faf-daily'; // normal daily (also migrates the legacy key)
const CHALLENGE_KEY = 'faf-daily-challenge'; // daily challenge, tracked separately
const MODE_KEY = 'faf-daily-mode'; // which mode this browser last had open
const DATA_URL = 'https://faforever.github.io/etfreeman-db/#/';

// Hand-picked answers for specific dates (UTC), overriding the daily algorithm.
const DAILY_OVERRIDES: Record<string, string> = {
  '2026-07-11': 'DRLK005', // Crab Egg (Bouncer)
};

interface Saved {
  date: string;
  guesses: string[];
  solved: boolean;
}

function storeKey(mode: Mode): string {
  return mode === 'challenge' ? CHALLENGE_KEY : STORE_KEY;
}

// Per-mode progress, kept under separate keys so switching modes never resets
// the other one (and a refresh restores whichever you were on).
function loadSaved(mode: Mode): Saved {
  try {
    const raw =
      localStorage.getItem(storeKey(mode)) ??
      (mode === 'daily' ? localStorage.getItem('faf-unitdle') : null);
    if (raw) {
      const s = JSON.parse(raw) as Saved;
      if (s.date === todayKey()) return s;
    }
  } catch {
    /* ignore */
  }
  return { date: todayKey(), guesses: [], solved: false };
}

function loadGuesses(mode: Mode): Unit[] {
  return loadSaved(mode).guesses.map(findById).filter((u): u is Unit => !!u);
}

function loadMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'challenge' ? 'challenge' : 'daily';
  } catch {
    return 'daily';
  }
}

function pickAnswer(mode: Mode): Unit {
  if (mode === 'challenge') return UNITS[challengeIndex(UNITS.length)];
  const forced = DAILY_OVERRIDES[todayKey()];
  const override = forced ? findById(forced) : undefined;
  return override ?? UNITS[dailyIndex(UNITS.length)];
}

export default function App() {
  const [mode, setMode] = useState<Mode>(loadMode);
  const answer = useMemo(() => pickAnswer(mode), [mode]);
  const chal: ChallengeConfig | null = useMemo(
    () => (mode === 'challenge' ? challengeConfig(answer) : null),
    [mode, answer]
  );
  const [guesses, setGuesses] = useState<Unit[]>(() => loadGuesses(mode));
  const solved = guesses.some((g) => g.id === answer.id);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const saved: Saved = { date: todayKey(), guesses: guesses.map((g) => g.id), solved };
    localStorage.setItem(storeKey(mode), JSON.stringify(saved));
  }, [mode, guesses, solved]);

  // Switch modes: remember the choice and load that mode's own saved progress in
  // the same update, so the save effect can't clobber the other mode's data.
  const switchMode = useCallback((next: Mode) => {
    setMode(next);
    setGuesses(loadGuesses(next));
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  // In the challenge, hide two columns and inject one lie while playing; once
  // solved, reveal the truth so a finished board never looks wrong.
  const hidden = !solved && chal ? new Set(chal.hidden) : undefined;
  const gridAnswer = !solved && chal ? ({ ...answer, ...chal.decoy } as Unit) : answer;

  useEffect(() => {
    if (!solved) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [solved]);

  const guessedIds = new Set(guesses.map((g) => g.id));
  const pool = useMemo(() => UNITS.filter((u) => !guessedIds.has(u.id)), [guesses]);

  const onPick = useCallback(
    (u: Unit) => {
      if (solved) return;
      setGuesses((prev) => (prev.some((g) => g.id === u.id) ? prev : [...prev, u]));
    },
    [solved]
  );

  const showIntro = !solved && guesses.length === 0;

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1240px] px-4 py-10 sm:py-14">
        {/* header */}
        <header className="border-b border-line pb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-mono text-xl font-semibold uppercase tracking-[0.2em] text-slate-100">
                {mode === 'challenge' ? (
                  <>
                    FAF Daily <span className="text-accent">Challenge</span>
                  </>
                ) : (
                  <>
                    FAF <span className="text-accent">Daily</span>
                  </>
                )}
              </h1>
              <p className="mt-1.5 text-sm text-slate-400">
                {mode === 'challenge'
                  ? 'Two stats are hidden and one is a lie. Guess the unit.'
                  : 'Guess the daily Forged Alliance unit.'}
              </p>
            </div>
            <button
              onClick={() => switchMode(mode === 'challenge' ? 'daily' : 'challenge')}
              title={mode === 'challenge' ? 'Back to the normal daily' : 'Try the harder daily challenge'}
              className={`inline-flex shrink-0 items-center gap-2 border px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-widest transition-colors ${
                mode === 'challenge'
                  ? 'border-line text-slate-300 hover:border-accent hover:text-accent'
                  : 'border-accent/70 text-accent hover:bg-accent hover:text-slate-950'
              }`}
            >
              {mode === 'challenge' ? (
                <>
                  <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
                  FAF Daily
                </>
              ) : (
                <>
                  <Swords className="h-3.5 w-3.5" strokeWidth={2.5} />
                  FAF Daily Challenge
                </>
              )}
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-widest text-slate-500">
            <span>
              {mode === 'challenge' ? 'Challenge' : 'Puzzle'} #{puzzleNumber()}
            </span>
            <span className="text-slate-700">/</span>
            <span>{UNITS.length} units</span>
            <span className="text-slate-700">/</span>
            <span>{guesses.length} {guesses.length === 1 ? 'guess' : 'guesses'}</span>
          </div>
        </header>

        {/* how to play (landing) */}
        {showIntro && mode === 'daily' && (
          <section className="mt-6 border border-line bg-surface p-5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-accent">How to play</p>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
              A random Forged Alliance unit is picked every day. Type any unit to guess — each guess
              reveals how it compares to today's unit across its stats.{' '}
              <span className="font-semibold text-emerald-300">Green</span> = that attribute matches,{' '}
              <span className="font-semibold text-amber-300">amber</span> = partial match, and{' '}
              <span className="font-semibold text-slate-200">↑ / ↓</span> means the answer is higher / lower.
              Use the clues to identify it in as few tries as possible.
            </p>
            <p className="mt-3 font-mono text-[11px] uppercase tracking-widest text-slate-500">
              Search by name, role, or faction — e.g. “aeon bomber”, “t3 land factory”.
            </p>
          </section>
        )}
        {showIntro && mode === 'challenge' && (
          <section className="mt-6 border border-accent/40 bg-surface p-5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-accent">Daily challenge</p>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
              A different unit from the normal daily, with a twist. Two attribute columns are{' '}
              <span className="inline-flex items-center gap-1 font-semibold text-slate-200">
                <Lock className="h-3 w-3" strokeWidth={3} />
                hidden
              </span>{' '}
              with no clue at all, and exactly one visible column is a{' '}
              <span className="font-semibold text-rose-300">lie</span>. You are not told which one. Every other column is honest. Solve it and
              the hidden stats and the lie are revealed.
            </p>
            <p className="mt-3 font-mono text-[11px] uppercase tracking-widest text-slate-500">
              Same search as always - name, role, or faction.
            </p>
          </section>
        )}

        {/* input / win */}
        <div className="mt-7">
          {solved ? (
            <WinCard answer={answer} guesses={guesses} now={now} challenge={mode === 'challenge'} />
          ) : (
            <Search pool={pool} onPick={onPick} />
          )}
        </div>

        {/* legend */}
        {guesses.length > 0 && (
          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[10px] uppercase tracking-widest text-slate-400">
            <Legend className="bg-emerald-500/20 ring-1 ring-inset ring-emerald-400/50" label="Match" />
            <Legend className="bg-amber-500/20 ring-1 ring-inset ring-amber-400/50" label="Partial" />
            <Legend className="bg-surface2 ring-1 ring-inset ring-line" label="Miss" />
            {mode === 'challenge' && !solved && (
              <span className="flex items-center gap-1.5 text-slate-500">
                <Lock className="h-3 w-3" strokeWidth={3} /> Hidden
              </span>
            )}
            <span className="text-slate-500">↑ / ↓ answer is higher / lower</span>
          </div>
        )}

        {/* challenge status */}
        {mode === 'challenge' && guesses.length > 0 && !solved && (
          <div className="mt-4 flex items-start gap-2 border border-accent/30 bg-surface px-4 py-2.5 text-[13px] text-slate-300">
            <Swords className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={2} />
            <span>Two stats are hidden and one visible stat is lying this round.</span>
          </div>
        )}
        {mode === 'challenge' && solved && chal && (
          <div className="mt-4 border border-line bg-surface px-4 py-3 text-[13px] leading-relaxed text-slate-300">
            <span className="font-semibold text-rose-300">{columnLabels([chal.liar])[0]}</span> was the lie this
            round, and{' '}
            <span className="font-semibold text-slate-200">{columnLabels(chal.hidden).join(' and ')}</span>{' '}
            {chal.hidden.length === 1 ? 'was' : 'were'} hidden. The board below now shows every stat truthfully.
          </div>
        )}

        {/* guesses */}
        <div className="mt-3">
          <GuessGrid guesses={guesses} answer={gridAnswer} hidden={hidden} />
        </div>

        <footer className="mt-14 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-4 font-mono text-[10px] uppercase tracking-widest text-slate-600">
          <span>{UNITS.length} units · resets 00:00 UTC</span>
          <span className="text-slate-700">·</span>
          <a
            href={DATA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 underline decoration-slate-700 underline-offset-2 transition-colors hover:text-accent"
          >
            Unit data &amp; icons from the FAF Unit Database ↗
          </a>
        </footer>
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 ${className}`} />
      {label}
    </span>
  );
}

function WinCard({
  answer,
  guesses,
  now,
  challenge,
}: {
  answer: Unit;
  guesses: Unit[];
  now: number;
  challenge: boolean;
}) {
  const left = msUntilNextUTCDay(new Date(now));
  const count = guesses.length;
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const label = challenge ? 'Daily Challenge' : 'Daily';
  const shareText = `I solved FAF ${label} #${puzzleNumber()} in ${count} ${count === 1 ? 'try' : 'tries'} — try it yourself: ${location.origin}`;

  async function shareImg(spoilerFree: boolean) {
    setBusy(true);
    setFlash(null);
    try {
      const blob = await buildShareImage(guesses, answer, { spoilerFree, challenge });
      if (!blob) return;
      const name = `${spoilerFree ? '' : 'SPOILER_'}faf-daily${challenge ? '-challenge' : ''}-${puzzleNumber()}.png`;
      const file = new File([blob], name, { type: 'image/png' });
      const nav = navigator as Navigator & {
        canShare?: (d: unknown) => boolean;
        share?: (d: unknown) => Promise<void>;
      };
      // Phones → native share sheet, image only (Discord auto-blurs the SPOILER_ file).
      const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
      if (coarse && nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
        await nav.share({ files: [file] });
        setFlash('Shared');
      } else {
        // Desktop → copy the image to the clipboard.
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          setFlash(
            spoilerFree
              ? 'Image copied — paste it into Discord'
              : 'Image copied — paste, then click “Mark as spoiler”'
          );
        } catch {
          // Some browsers (e.g. Opera GX) block image clipboard writes.
          setFlash('This browser blocked the image copy — use “Copy link” instead');
        }
      }
      setTimeout(() => setFlash(null), 6000);
    } catch {
      /* cancelled or error — ignore */
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareText);
      setFlash('Link copied');
    } catch {
      setFlash('Copy failed — select the text and copy it manually');
    }
    setTimeout(() => setFlash(null), 4000);
  }

  return (
    <div className="border border-line bg-surface">
      <div className="flex items-center gap-4 border-b border-line p-5">
        <UnitIcon unit={answer} size={84} />
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-400">Identified</p>
          <h2 className="mt-1 truncate text-xl font-semibold text-slate-100 sm:text-2xl">{answer.name}</h2>
          <p className="mt-0.5 truncate font-mono text-xs uppercase tracking-wide text-slate-500">
            {answer.faction} · {answer.tech} · {answer.desc}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-mono text-xs uppercase tracking-widest text-slate-400">
            Solved in <span className="text-emerald-300">{count}</span> {count === 1 ? 'try' : 'tries'}
          </p>
          <span className="inline-flex items-center gap-2 border border-accent/70 px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-accent">
            <Clock className="h-3.5 w-3.5" strokeWidth={2} />
            Next unit {formatCountdown(left)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => shareImg(true)}
            disabled={busy}
            title="Image with just the colored squares — reveals nothing"
            className="inline-flex items-center gap-2 bg-slate-100 px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-widest text-slate-950 transition-colors hover:bg-white disabled:opacity-60"
          >
            <Share2 className="h-4 w-4" strokeWidth={2} />
            {busy ? 'Rendering…' : 'Share (no spoilers)'}
          </button>
          <button
            onClick={() => shareImg(false)}
            disabled={busy}
            title="Image showing your guessed units (answer hidden) — spoilers"
            className="inline-flex items-center gap-2 border border-line px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-widest text-slate-300 transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
          >
            <Share2 className="h-4 w-4" strokeWidth={2} />
            With guesses
          </button>
        </div>
      </div>

      {flash && <p className="px-5 -mt-2 pb-3 font-mono text-[11px] text-emerald-300">{flash}</p>}

      {/* the link / "try it yourself" as copyable text (works in every browser) */}
      <div className="flex items-center gap-3 border-t border-line p-4">
        <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-400">{shareText}</code>
        <button
          onClick={copyLink}
          className="inline-flex shrink-0 items-center gap-2 border border-line px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-slate-300 transition-colors hover:border-accent hover:text-accent"
        >
          <Copy className="h-3.5 w-3.5" strokeWidth={2} />
          Copy link
        </button>
      </div>
    </div>
  );
}
