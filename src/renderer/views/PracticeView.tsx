import React, { useEffect, useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import { PracticeProblem, PracticeTurn, ProbingSession } from '../../shared/types';
import { RichText } from '../components/RichText';
import { ErrorNotice } from '../components/ErrorNotice';
import { BusyStatus } from '../components/BusyStatus';
import { DictationOverlay } from '../components/DictationOverlay';
import { applyDictation, useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n';
import { cleanError, isCancelled, isSessionChanged } from '../lib/errors';

interface PracticeViewProps {
  session: ProbingSession;
  onSessionUpdate?: (session: ProbingSession) => void;
  /** Tells the parent an AI call is running, so it can lock session navigation. */
  onBusyChange?: (busy: boolean) => void;
}

const MODE_KEY: Record<PracticeProblem['mode'], MessageKey> = {
  recall: 'practice.mode.recall',
  discrimination: 'practice.mode.discrimination',
  composition: 'practice.mode.composition',
};
const OUTCOME_KEY: Record<NonNullable<PracticeProblem['outcome']>, MessageKey> = {
  solved: 'practice.outcome.solved',
  surrendered: 'practice.outcome.surrendered',
  dismissed: 'practice.outcome.dismissed',
};

/**
 * A practice session: a stream of problems. One problem is open at a time; the learner sends
 * thinking in progress (and gets one rung of help) or hands in an answer, and after each problem
 * there is a pause that only he ends.
 */
export const PracticeView: React.FC<PracticeViewProps> = ({ session: initial, onSessionUpdate, onBusyChange }) => {
  const { t } = useI18n();
  const [session, setSession] = useState(initial);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; retry?: () => void } | null>(null);
  const [work, setWork] = useState('');
  const [question, setQuestion] = useState('');
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const practice = session.practice;
  const active = practice?.active;
  const history = practice?.history ?? [];
  const lastDone = history[history.length - 1];
  const busy = busyLabel !== null;

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  // Dictation writes in the field on screen: the work on an open problem, the question in a pause
  const dictationTargetRef = useRef<'work' | 'question' | null>(null);
  dictationTargetRef.current = active ? 'work' : lastDone && !practice?.finished ? 'question' : null;
  const dictationInterimRef = useRef('');
  const writeDictation = (text: string, isFinal: boolean) => {
    const previous = dictationInterimRef.current;
    dictationInterimRef.current = isFinal ? '' : text;
    const update = (current: string) => applyDictation(current, previous, text);
    if (dictationTargetRef.current === 'work') setWork(update);
    else if (dictationTargetRef.current === 'question') setQuestion(update);
  };
  const {
    isListening,
    isTranscribing,
    toggleListening,
    error: speechError,
  } = useSpeechRecognition(
    (voiceText) => writeDictation(voiceText, true),
    (voiceText) => writeDictation(voiceText, false)
  );
  const isDictating = isListening || isTranscribing;

  useEffect(() => {
    const handleGlobalDictate = () => toggleListening();
    window.addEventListener('toggle-dictate', handleGlobalDictate);
    return () => window.removeEventListener('toggle-dictate', handleGlobalDictate);
  }, [toggleListening]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [active?.id, active?.turns.length, history.length, lastDone?.turns.length, busy]);

  /** Runs one action against the main process. `keep` puts the typed text back when it fails. */
  const run = async (label: string, action: () => Promise<ProbingSession>, retry?: () => void, keep?: () => void) => {
    setBusyLabel(label);
    setError(null);
    try {
      const next = await action();
      setSession(next);
      onSessionUpdate?.(next);
      setConfirmGiveUp(false);
    } catch (err) {
      keep?.();
      if (isSessionChanged(err)) return;
      setError({
        message: isCancelled(err) ? t('session.err.cancelled') : cleanError(err, t('session.err.unexpected')),
        retry,
      });
    } finally {
      setBusyLabel(null);
    }
  };

  const poseNext = () => void run(t('practice.status.pose'), () => window.api.practiceNext(), poseNext);

  // Straight to problems: a session that has none yet poses the first one by itself
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || !practice || practice.active || practice.history.length > 0 || practice.finished) return;
    startedRef.current = true;
    poseNext();
  }, []);

  const send = (kind: 'work' | 'claim') => {
    const text = work.trim();
    if (kind === 'claim' && !text) return;
    setWork('');
    void run(
      t(kind === 'claim' ? 'practice.status.claim' : 'practice.status.help'),
      () => window.api.practiceSubmit(kind, text),
      undefined,
      () => setWork(text)
    );
  };

  const conclude = (reason: 'surrendered' | 'dismissed') =>
    void run(t('practice.status.conclude'), () => window.api.practiceConclude(reason));

  const ask = () => {
    const text = question.trim();
    if (!text) return;
    setQuestion('');
    void run(t('practice.status.ask'), () => window.api.practiceAsk(text), undefined, () => setQuestion(text));
  };

  const wrapUp = () =>
    void run(t('practice.status.pose'), async () => {
      await window.api.practiceClose();
      return window.api.practiceNext();
    });

  if (!practice) return null;

  const turnLabel = (turn: PracticeTurn): string =>
    turn.kind === 'hint'
      ? turn.rung === undefined
        ? t('practice.turn.statement')
        : t('practice.turn.hint', { rung: turn.rung })
      : turn.kind === 'verdict'
      ? t(turn.correct ? 'practice.turn.right' : 'practice.turn.wrong')
      : turn.kind === 'claim'
      ? t('practice.turn.claim')
      : turn.kind === 'question'
      ? t('practice.turn.question')
      : turn.kind === 'answer'
      ? t('practice.turn.answer')
      : t('practice.turn.work');

  const renderTurns = (turns: PracticeTurn[]) =>
    turns.map((turn, i) => (
      <div
        key={i}
        className={
          turn.role === 'student'
            ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-ink-700 px-4 py-2.5'
            : `max-w-[92%] rounded-2xl rounded-bl-sm border px-4 py-2.5 ${
                turn.kind === 'verdict'
                  ? turn.correct
                    ? 'border-emerald-700/60 bg-emerald-950/20'
                    : 'border-amber-700/60 bg-amber-950/20'
                  : 'border-ink-600 bg-ink-850'
              }`
        }
      >
        <span className="label-mono mb-1 block">{turnLabel(turn)}</span>
        {turn.text ? (
          <RichText text={turn.text} className="text-sm leading-relaxed text-gray-100" />
        ) : (
          <span className="text-sm italic text-gray-400">{t('practice.turn.empty')}</span>
        )}
      </div>
    ));

  const problemTitle = (p: PracticeProblem, n: number) =>
    `${t('practice.problem', { n })} · ${t(MODE_KEY[p.mode])}${p.retestOf ? ` · ${t('practice.retest')}` : ''}`;

  const solved = history.filter((p) => p.outcome === 'solved').length;
  const inPause = !active && Boolean(lastDone) && !practice.finished;
  // The problem being discussed in the pause is shown open, below the older ones
  const older = inPause || practice.finished ? history.slice(0, -1) : history;

  const dictateLabel = isListening
    ? t('session.dictate.listening')
    : isTranscribing
    ? t('session.dictate.transcribing')
    : t('session.dictate.label');
  const dictateButton = (
    <button
      type="button"
      data-testid="practice-dictate"
      onClick={toggleListening}
      disabled={isTranscribing || (busy && !isListening)}
      className={`mr-auto flex items-center space-x-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] transition-colors disabled:opacity-40 ${
        isListening
          ? 'animate-pulse border-red-600 bg-red-950/60 text-red-400'
          : 'border-ink-600 bg-ink-850 text-gray-400 hover:border-gray-500 hover:text-gray-200'
      }`}
      title={t('session.dictate.title')}
      aria-label={dictateLabel}
    >
      <Mic className={`h-3 w-3 ${isListening ? 'text-red-400' : 'text-gray-400'}`} />
      <span>{dictateLabel}</span>
    </button>
  );
  const fieldClass = `block w-full resize-none bg-transparent font-sans text-sm outline-none placeholder:text-gray-500 ${
    isDictating ? 'text-transparent caret-gray-200' : 'text-gray-200'
  }`;

  const solutionBlock = (p: PracticeProblem) => (
    <div className="rounded-xl bg-ink-900 px-4 py-3">
      <span className="label-mono mb-1.5 block text-emerald-300">{t('practice.solution')}</span>
      <RichText text={p.modelSolution || ''} className="text-sm leading-7 text-gray-100" />
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div data-testid="practice-feed" className="min-h-0 flex-1 select-text overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-3xl space-y-5 pb-6">
          <header className="space-y-2">
            <span className="rounded-full border border-ink-600 px-3 py-0.5 font-mono text-[10px] uppercase tracking-widest text-gray-400">
              {t('phase.practice')}
            </span>
            <h2 className="font-serif text-lg text-gray-100">{practice.material}</h2>
            {practice.targets.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label={t('practice.targets')}>
                {practice.targets.map((target) => (
                  <li key={target.id} title={target.truth} className="rounded-full bg-ink-800 px-2.5 py-0.5 text-[11px] text-gray-300">
                    {target.title}
                  </li>
                ))}
              </ul>
            )}
          </header>

          {older.map((p, i) => (
            <details key={p.id} data-testid="past-problem" className="rounded-lg border border-ink-700 bg-ink-900 px-4 py-2.5 text-xs text-gray-300">
              <summary className="cursor-pointer font-mono text-[11px] text-gray-400 hover:text-gray-200">
                {problemTitle(p, i + 1)} · {p.outcome ? t(OUTCOME_KEY[p.outcome]) : ''}
              </summary>
              <div className="mt-3 space-y-3">
                <RichText text={p.statement} className="text-sm leading-relaxed text-gray-200" />
                {renderTurns(p.turns)}
                {solutionBlock(p)}
              </div>
            </details>
          ))}

          {active && (
            <section data-testid="practice-problem" className="card dock-variant space-y-4 p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="label-mono text-gray-300">{problemTitle(active, history.length + 1)}</span>
                {active.maxRung >= 0 && (
                  <span className="font-mono text-[10px] text-gray-500">{t('practice.helpUsed', { rung: active.maxRung })}</span>
                )}
              </div>
              <RichText text={active.statement} className="font-serif text-base leading-relaxed text-gray-100" />
              {active.turns.length > 0 && <div className="flex flex-col gap-3">{renderTurns(active.turns)}</div>}

              <div className="rounded-xl border border-ink-600 bg-ink-950 px-3.5 py-3 focus-within:border-ink-400">
                <label className="label-mono mb-1.5 block" htmlFor="practice-work">
                  {t('practice.work.label')}
                </label>
                <div className="relative">
                  <textarea
                    id="practice-work"
                    value={work}
                    onChange={(e) => setWork(e.target.value)}
                    placeholder={t('practice.work.placeholder')}
                    disabled={busy}
                    rows={3}
                    className={fieldClass}
                  />
                  {isDictating && <DictationOverlay value={work} className="font-sans text-sm text-gray-200" />}
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                  {dictateButton}
                  <button
                    type="button"
                    onClick={() => send('work')}
                    disabled={busy}
                    className="rounded-md border border-ink-500 px-3.5 py-1.5 font-mono text-[11px] font-semibold text-gray-200 transition-colors hover:border-gray-400 disabled:opacity-40"
                  >
                    {t('practice.askHelp')}
                  </button>
                  <button
                    type="button"
                    onClick={() => send('claim')}
                    disabled={busy || !work.trim()}
                    className="rounded-md bg-gray-200 px-3.5 py-1.5 font-mono text-[11px] font-semibold text-ink-950 transition-colors hover:bg-white disabled:bg-ink-500 disabled:text-gray-400"
                  >
                    {t('practice.handIn')}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 text-[11px]">
                {confirmGiveUp ? (
                  <>
                    <span className="text-amber-200">{t('practice.giveUp.confirm')}</span>
                    <button type="button" onClick={() => conclude('surrendered')} disabled={busy} className="font-semibold text-amber-200 underline hover:text-amber-100">
                      {t('practice.giveUp.yes')}
                    </button>
                    <button type="button" onClick={() => setConfirmGiveUp(false)} className="text-gray-400 underline hover:text-gray-200">
                      {t('practice.giveUp.no')}
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => setConfirmGiveUp(true)} disabled={busy} className="text-gray-400 underline hover:text-gray-200 disabled:opacity-40">
                      {t('practice.giveUp')}
                    </button>
                    <button type="button" onClick={() => conclude('dismissed')} disabled={busy} className="text-gray-400 underline hover:text-gray-200 disabled:opacity-40">
                      {t('practice.dismiss')}
                    </button>
                  </>
                )}
              </div>
            </section>
          )}

          {(inPause || practice.finished) && lastDone && (
            <section data-testid="practice-pause" className="card space-y-4 p-5">
              <span className="label-mono block text-gray-300">
                {problemTitle(lastDone, history.length)} · {lastDone.outcome ? t(OUTCOME_KEY[lastDone.outcome]) : ''}
              </span>
              <RichText text={lastDone.statement} className="text-sm leading-relaxed text-gray-200" />
              {lastDone.turns.length > 0 && <div className="flex flex-col gap-3">{renderTurns(lastDone.turns)}</div>}
              {solutionBlock(lastDone)}

              {inPause && (
                <>
                  <div className="rounded-xl border border-ink-600 bg-ink-950 px-3.5 py-3 focus-within:border-ink-400">
                    <label className="label-mono mb-1.5 block" htmlFor="practice-question">
                      {t('practice.pause.label')}
                    </label>
                    <div className="relative">
                      <textarea
                        id="practice-question"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder={t('practice.pause.placeholder')}
                        disabled={busy}
                        rows={2}
                        className={fieldClass}
                      />
                      {isDictating && <DictationOverlay value={question} className="font-sans text-sm text-gray-200" />}
                    </div>
                    <div className="mt-2 flex items-center justify-end">
                      {dictateButton}
                      <button
                        type="button"
                        onClick={ask}
                        disabled={busy || !question.trim()}
                        className="rounded-md border border-ink-500 px-3.5 py-1.5 font-mono text-[11px] font-semibold text-gray-200 transition-colors hover:border-gray-400 disabled:opacity-40"
                      >
                        {t('practice.pause.ask')}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    {!practice.closing && (
                      <button type="button" onClick={wrapUp} disabled={busy} className="text-[11px] text-gray-400 underline hover:text-gray-200 disabled:opacity-40">
                        {t('practice.wrapUp')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={poseNext}
                      disabled={busy}
                      className="rounded bg-gray-200 px-4 py-2 text-xs font-bold text-black transition-colors hover:bg-white disabled:cursor-wait disabled:opacity-50"
                    >
                      {t(practice.closing ? 'practice.nextRetest' : 'practice.next')}
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          {practice.finished && (
            <section data-testid="practice-finished" className="rounded-xl border border-ink-600 bg-ink-850 p-5">
              <h3 className="font-serif text-sm font-bold text-white">{t('practice.finished.title')}</h3>
              <p className="mt-2 text-xs leading-relaxed text-gray-300">
                {t('practice.finished.body', { solved, total: history.length })}
              </p>
            </section>
          )}

          <div ref={endRef} aria-hidden />
        </div>
      </div>

      {(busy || error || speechError) && (
        <div className="shrink-0 bg-ink-950 px-6 pb-3 pt-2">
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            {error && (
              <ErrorNotice message={error.message} onRetry={error.retry} retryLabel={error.retry ? t('session.retry') : undefined} />
            )}
            {speechError && <ErrorNotice message={speechError} />}
            {busy && (
              <BusyStatus label={busyLabel!} cancelLabel={t('session.cancel')} onCancel={() => void window.api.cancelOperation()} />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
