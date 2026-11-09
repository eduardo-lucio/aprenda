import { useEffect, useMemo, useRef, useState } from 'react';
import { CompletedLesson, ConceptNode, ConceptNote, ProbeAttempt } from '../../shared/types';
import { cleanError } from '../lib/errors';

/** Small enough that a truncated AI answer loses little, and notes appear as they are written. */
const BATCH_SIZE = 6;

export function noteEvidenceKey(node: ConceptNode, attempts: ProbeAttempt[], lessons: CompletedLesson[]): string {
  const attemptCount = attempts.filter((a) => a.nodeId === node.id).length;
  const lessonCount = lessons.filter((l) => l.nodeId === node.id).length;
  return `${node.status}|${attemptCount}|${lessonCount}`;
}

interface UseConceptNotesParams {
  sessionId?: string;
  nodes: ConceptNode[];
  attempts: ProbeAttempt[];
  lessons: CompletedLesson[];
  /** Notes cost tokens: they are only written once the student opens the page. */
  enabled: boolean;
  initialNotes?: ConceptNote[];
  fallbackError: string;
  incompleteError: string;
}

export function useConceptNotes({
  sessionId,
  nodes,
  attempts,
  lessons,
  enabled,
  initialNotes = [],
  fallbackError,
  incompleteError,
}: UseConceptNotesParams) {
  const [notes, setNotes] = useState<ConceptNote[]>(initialNotes);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rerun, setRerun] = useState(0);

  const runningRef = useRef(false);
  const aliveRef = useRef(true);
  // One request per version of each concept: an answer that omits a concept must not loop
  const requestedRef = useRef(new Map<string, string>());

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const staleKeys = useMemo(() => {
    const current = new Map(notes.map((n) => [n.nodeId, n.evidenceKey]));
    const stale = new Map<string, string>();
    for (const node of nodes) {
      const key = noteEvidenceKey(node, attempts, lessons);
      if (current.get(node.id) !== key) stale.set(node.id, key);
    }
    return stale;
  }, [notes, nodes, attempts, lessons]);
  const staleSignature = Array.from(staleKeys, ([id, key]) => `${id}:${key}`).join(',');

  useEffect(() => {
    if (!enabled || !sessionId || runningRef.current) return;
    const batchable = Array.from(staleKeys).filter(([id, key]) => requestedRef.current.get(id) !== key);
    if (batchable.length === 0) return;

    for (const [id, key] of batchable) requestedRef.current.set(id, key);
    runningRef.current = true;
    setPendingIds(batchable.map(([id]) => id));
    setError(null);

    void (async () => {
      let missing = false;
      try {
        for (let i = 0; i < batchable.length && aliveRef.current; i += BATCH_SIZE) {
          const batch = batchable.slice(i, i + BATCH_SIZE);
          const ids = batch.map(([id]) => id);
          const written = await window.api.generateConceptNotes(sessionId, ids);
          if (!aliveRef.current) return;
          const keys = new Map(batch);
          const valid = written.filter((n) => keys.has(n.nodeId));
          missing ||= valid.length < batch.length;
          setNotes((prev) => [
            ...prev.filter((n) => !valid.some((v) => v.nodeId === n.nodeId)),
            ...valid.map((n) => ({ ...n, evidenceKey: keys.get(n.nodeId)! })),
          ]);
          setPendingIds((prev) => prev.filter((id) => !ids.includes(id)));
        }
        if (missing && aliveRef.current) setError(incompleteError);
      } catch (err) {
        if (aliveRef.current) setError(cleanError(err, fallbackError));
      } finally {
        runningRef.current = false;
        if (aliveRef.current) {
          setPendingIds([]);
          // Progress made while this run was going needs its own run
          setRerun((v) => v + 1);
        }
      }
    })();
  }, [enabled, sessionId, staleSignature, rerun]);

  const retry = () => {
    for (const id of staleKeys.keys()) requestedRef.current.delete(id);
    setError(null);
    setRerun((v) => v + 1);
  };

  return { notes, pendingIds, error, retry };
}
