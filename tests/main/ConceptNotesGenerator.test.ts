import { describe, it, expect, vi } from 'vitest';
import {
  ConceptEvidence,
  ConceptNotesGenerator,
  sanitizeConceptNotes,
} from '../../src/main/services/ConceptNotesGenerator';
import { ConceptNode, ProbeAttempt } from '../../src/shared/types';

const node = (id: string, status: ConceptNode['status']): ConceptNode => ({
  id,
  title: id,
  summary: 's',
  level: 1,
  prerequisites: [],
  unconditionalTruth: 'u',
  status,
});

const attempt = { nodeId: 'a', verdict: 'frontier', questionText: 'q', judgeReasoning: 'j' } as ProbeAttempt;
const evidence = (id: string, status: ConceptNode['status'], attempts: ProbeAttempt[] = []): ConceptEvidence => ({
  node: node(id, status),
  attempts,
  lessons: [],
});

describe('sanitizeConceptNotes', () => {
  it('drops unknown concepts and notes without a summary, and cleans topics', () => {
    const notes = sanitizeConceptNotes(
      {
        notes: [
          { nodeId: 'a', summary: ' ok ', toLearn: ['x', 'x', ' ', 3], learned: 'nope' },
          { nodeId: 'ghost', summary: 'ok' },
          { nodeId: 'b', summary: '' },
        ],
      },
      [evidence('a', 'frontier', [attempt]), evidence('b', 'frontier')]
    );
    expect(notes).toEqual([{ nodeId: 'a', summary: 'ok', toLearn: ['x'], learned: [] }]);
  });

  it('never credits learning on a concept the session has no evidence for', () => {
    const [note] = sanitizeConceptNotes(
      [{ nodeId: 'a', summary: 'ok', toLearn: [], learned: ['invented'] }],
      [evidence('a', 'untested')]
    );
    expect(note.learned).toEqual([]);
  });

  it('keeps learned topics when the concept was mastered by inference', () => {
    const [note] = sanitizeConceptNotes(
      [{ nodeId: 'a', summary: 'ok', toLearn: [], learned: ['real'] }],
      [evidence('a', 'mastered')]
    );
    expect(note.learned).toEqual(['real']);
  });
});

describe('ConceptNotesGenerator', () => {
  it('retries a malformed answer without blocking the foreground', async () => {
    const llm = vi
      .fn()
      .mockResolvedValueOnce('not json')
      .mockResolvedValueOnce(JSON.stringify({ notes: [{ nodeId: 'a', summary: 'ok', toLearn: ['t'], learned: [] }] }));
    const notes = await new ConceptNotesGenerator(llm).generate('goal', [evidence('a', 'frontier')]);
    expect(notes).toHaveLength(1);
    expect(llm).toHaveBeenCalledTimes(2);
    expect(llm.mock.calls[0][0].isBackground).toBe(true);
  });

  it('does not call the AI when there is nothing to write', async () => {
    const llm = vi.fn();
    expect(await new ConceptNotesGenerator(llm).generate('goal', [])).toEqual([]);
    expect(llm).not.toHaveBeenCalled();
  });
});
