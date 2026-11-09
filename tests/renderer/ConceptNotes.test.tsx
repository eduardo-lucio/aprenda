import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { act, render, renderHook, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { noteEvidenceKey, useConceptNotes } from '../../src/renderer/hooks/useConceptNotes';
import { NotesView } from '../../src/renderer/components/NotesView';
import { NodeDetailPanel } from '../../src/renderer/components/NodeDetailPanel';
import { ConceptNode, ConceptNote, ProbeAttempt } from '../../src/shared/types';

const node = (id: string, status: ConceptNode['status'] = 'frontier'): ConceptNode => ({
  id,
  title: `Conceito ${id}`,
  summary: `Mapa ${id}`,
  level: 1,
  prerequisites: [],
  unconditionalTruth: 'u',
  status,
});
const written = (nodeId: string) => ({ nodeId, summary: `Nota ${nodeId}`, toLearn: ['t'], learned: [] });

const baseParams = {
  sessionId: 's1',
  attempts: [] as ProbeAttempt[],
  lessons: [],
  fallbackError: 'falhou',
  incompleteError: 'incompleto',
};

let generate: ReturnType<typeof vi.fn>;
beforeEach(() => {
  generate = vi.fn(async (_s: string, ids: string[]) => ids.map(written));
  (window as any).api = { generateConceptNotes: generate };
});

describe('useConceptNotes', () => {
  it('spends nothing until the page is opened, then writes in batches', async () => {
    const nodes = Array.from({ length: 7 }, (_v, i) => node(`n${i}`));
    const { result, rerender } = renderHook((p) => useConceptNotes(p), {
      initialProps: { ...baseParams, nodes, enabled: false },
    });
    expect(generate).not.toHaveBeenCalled();

    rerender({ ...baseParams, nodes, enabled: true });
    await waitFor(() => expect(result.current.notes).toHaveLength(7));
    expect(generate.mock.calls.map((c) => c[1].length)).toEqual([6, 1]);
  });

  it('keeps saved notes that are still current and rewrites only stale ones', async () => {
    const nodes = [node('a'), node('b', 'mastered')];
    const initialNotes: ConceptNote[] = [
      { ...written('a'), evidenceKey: noteEvidenceKey(nodes[0], [], []) },
      { ...written('b'), evidenceKey: 'frontier|0|0' },
    ];
    const { result } = renderHook(() => useConceptNotes({ ...baseParams, nodes, enabled: true, initialNotes }));
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    expect(generate.mock.calls[0][1]).toEqual(['b']);
    await waitFor(() =>
      expect(result.current.notes.find((n) => n.nodeId === 'b')?.evidenceKey).toBe('mastered|0|0')
    );
  });

  it('does not loop when the AI omits a concept, and retries on request', async () => {
    generate.mockImplementationOnce(async () => [written('a')]);
    const nodes = [node('a'), node('b')];
    const { result } = renderHook(() => useConceptNotes({ ...baseParams, nodes, enabled: true }));
    await waitFor(() => expect(result.current.error).toBe('incompleto'));
    expect(generate).toHaveBeenCalledTimes(1);

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.notes).toHaveLength(2));
    expect(generate.mock.calls[1][1]).toEqual(['b']);
    expect(result.current.error).toBeNull();
  });
});

describe('NotesView', () => {
  it('shows summary and both topic lists for each concept', () => {
    render(
      <NotesView
        nodes={[node('a')]}
        notes={[{ nodeId: 'a', summary: 'Resumo da IA', toLearn: ['Falta isto'], learned: ['Já sei aquilo'], evidenceKey: 'k' }]}
        pendingIds={[]}
        error={null}
        onRetry={() => {}}
      />
    );
    const card = within(screen.getByTestId('note-a'));
    expect(card.getByText('Resumo da IA')).toBeDefined();
    expect(card.getByText('Falta isto')).toBeDefined();
    expect(card.getByText('Já sei aquilo')).toBeDefined();
  });

  it('falls back to the map summary while the note is being written', () => {
    render(<NotesView nodes={[node('a')]} notes={[]} pendingIds={['a']} error={null} onRetry={() => {}} />);
    const card = within(screen.getByTestId('note-a'));
    expect(card.getByText('Mapa a')).toBeDefined();
    expect(card.getAllByText(/escrevendo/i)).toHaveLength(2);
  });

  it('offers a retry when writing failed', () => {
    const onRetry = vi.fn();
    render(<NotesView nodes={[node('a')]} notes={[]} pendingIds={[]} error="falhou" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('NodeDetailPanel', () => {
  it('links the selected concept to its note', () => {
    const onOpenNotes = vi.fn();
    render(
      <NodeDetailPanel node={node('a')} nodes={[node('a')]} onClose={() => {}} onSelect={() => {}} onOpenNotes={onOpenNotes} />
    );
    fireEvent.click(screen.getByRole('button', { name: /ver anotações/i }));
    expect(onOpenNotes).toHaveBeenCalledWith('a');
  });
});
