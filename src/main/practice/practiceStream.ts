import { PracticeMode, PracticeProblem, PracticeState } from '../../shared/types';

/** What the stream asks of the next problem. */
export interface PracticeDemand {
  /** Empty only before the first problem of a free topic: the targets are drawn from it then. */
  targetIds: string[];
  mode: PracticeMode;
  difficulty: number;
  retestOf?: string;
}

const MODES: PracticeMode[] = ['recall', 'discrimination', 'composition'];
/** The session opens with up to this many easy recall problems, to reactivate and calibrate. */
export const WARM_UP_PROBLEMS = 3;
export const MAX_DIFFICULTY = 5;

export type PracticeResult = 'clean' | 'helped' | 'miss';

/**
 * How a concluded problem went. Help up to a re-description of the pattern (rungs 0–1) means the
 * problem was about right; from the rung that names the proposition (3) the retrieval was surrendered.
 */
export function resultOf(p: PracticeProblem): PracticeResult {
  if (p.outcome !== 'solved' || p.maxRung >= 3) return 'miss';
  return p.maxRung >= 2 || p.wrongClaims > 0 ? 'helped' : 'clean';
}

const primary = (p: PracticeProblem): string | undefined => p.targetIds[0];

/**
 * Problems that failed and were not posed again yet. A retest that fails stands for the original
 * from then on, so nothing that failed ends the session unretested.
 */
export function pendingRetests(history: PracticeProblem[]): PracticeProblem[] {
  return history.filter(
    (p, i) => resultOf(p) === 'miss' && !history.slice(i + 1).some((later) => later.retestOf === p.id)
  );
}

/**
 * The next demand, or null when the session has nothing left to pose. The standing question is:
 * what is the cheapest demand that strengthens the weakest capability not yet demonstrated?
 */
export function nextDemand(state: PracticeState): PracticeDemand | null {
  const history = state.history;

  if (state.closing) {
    const retest = pendingRetests(history)[0];
    if (!retest) return null;
    return { targetIds: retest.targetIds, mode: retest.mode, difficulty: retest.difficulty, retestOf: retest.id };
  }

  if (state.targets.length === 0) return { targetIds: [], mode: 'recall', difficulty: 1 };

  const on = (id: string) => history.filter((p) => primary(p) === id);
  const cleanModes = (id: string) => new Set(on(id).filter((p) => resultOf(p) === 'clean').map((p) => p.mode));
  const lastUse = (id: string) => history.map(primary).lastIndexOf(id);
  const misses = (id: string) => on(id).filter((p) => resultOf(p) === 'miss').length;

  // Interleaving is the default: the switch clears what is active, and that is what makes a retrieval real
  const last = history[history.length - 1];
  const pool = state.targets.filter((t) => state.targets.length === 1 || t.id !== (last && primary(last)));
  // Weakest first (fewest modes shown unaided, then most misses), then least recently active
  const target = [...pool].sort(
    (a, b) =>
      cleanModes(a.id).size - cleanModes(b.id).size || misses(b.id) - misses(a.id) || lastUse(a.id) - lastUse(b.id)
  )[0];

  const warmUp = history.length < Math.min(WARM_UP_PROBLEMS, state.targets.length);
  const previous = on(target.id).slice(-1)[0];
  if (warmUp || !previous) return { targetIds: [target.id], mode: 'recall', difficulty: 1 };

  // The cheapest mode not yet shown unaided; composing needs a second thing to compose with
  const shown = cleanModes(target.id);
  const reachable = state.targets.length > 1 ? MODES : MODES.slice(0, 2);
  let mode = reachable.find((m) => !shown.has(m)) || reachable[reachable.length - 1];
  const result = resultOf(previous);
  // A later layer that fails often means the earlier one is weaker than it looked: drop back and test it
  if (result === 'miss' && MODES.indexOf(previous.mode) > 0) mode = MODES[MODES.indexOf(previous.mode) - 1];

  const step = result === 'clean' ? 1 : result === 'miss' ? -1 : 0;
  const difficulty = Math.min(MAX_DIFFICULTY, Math.max(1, previous.difficulty + step));

  if (mode !== 'composition') return { targetIds: [target.id], mode, difficulty };
  // Compose with what was most recently shown clean, so the load is in the joining, not in the parts
  const partner =
    [...history].reverse().find((p) => primary(p) !== target.id && resultOf(p) === 'clean' && primary(p)) ||
    undefined;
  const partnerId = (partner && primary(partner)) || state.targets.find((t) => t.id !== target.id)!.id;
  return { targetIds: [target.id, partnerId], mode, difficulty };
}
