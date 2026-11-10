import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { PracticeProblem, PracticeState, ProbingSession } from '../../src/shared/types';

const speech = vi.hoisted(() => ({
  toggle: vi.fn(),
  onFinal: undefined as undefined | ((text: string) => void),
  onInterim: undefined as undefined | ((text: string) => void),
  state: { isListening: false, isTranscribing: false, error: null as string | null },
}));

vi.mock('../../src/renderer/hooks/useSpeechRecognition', async (original) => ({
  ...(await original<typeof import('../../src/renderer/hooks/useSpeechRecognition')>()),
  useSpeechRecognition: (onFinal?: (text: string) => void, onInterim?: (text: string) => void) => {
    speech.onFinal = onFinal;
    speech.onInterim = onInterim;
    return { ...speech.state, toggleListening: speech.toggle };
  },
}));

import { PracticeView } from '../../src/renderer/views/PracticeView';

const problem = (over: Partial<PracticeProblem> = {}): PracticeProblem => ({
  id: 'p1', statement: 'Enunciado do problema 1', targetIds: ['a'], mode: 'recall', difficulty: 1, turns: [], maxRung: -1, wrongClaims: 0, ...over,
});
const practiceSession = (practice: Partial<PracticeState> = {}): ProbingSession =>
  ({
    id: 's-practice', mode: 'practice', disciplineId: 'Recursão', goal: 'Recursão', phase: 'practice', questionCount: 1, frontierClarity: 0,
    attempts: [], nodesState: {},
    practice: { material: 'Recursão', targets: [{ id: 'a', title: 'Caso base', truth: 'Toda recursão precisa parar.' }], history: [], ...practice },
  }) as ProbingSession;

describe('dictation in practice', () => {
  beforeEach(() => {
    speech.toggle.mockClear();
    speech.state = { isListening: false, isTranscribing: false, error: null };
    (window as any).api = { cancelOperation: vi.fn(), practiceNext: vi.fn() };
  });

  it('an open problem has a dictate button that writes in the work field', () => {
    render(<PracticeView session={practiceSession({ active: problem() })} />);
    fireEvent.click(screen.getByTestId('practice-dictate'));
    expect(speech.toggle).toHaveBeenCalledTimes(1);

    const field = screen.getByLabelText(/raciocínio|resposta/i, { selector: 'textarea' }) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: 'Digitado antes.' } });
    act(() => speech.onInterim?.('o caso'));
    act(() => speech.onInterim?.('o caso base'));
    expect(field.value).toBe('Digitado antes. o caso base');
    act(() => speech.onFinal?.('O caso base para.'));
    expect(field.value).toBe('Digitado antes. O caso base para.');
  });

  it('in the pause the dictation goes to the question field', () => {
    const done = problem({ outcome: 'solved', modelSolution: 'A solução.' });
    render(<PracticeView session={practiceSession({ history: [done] })} />);
    expect(screen.getByTestId('practice-dictate')).toBeDefined();
    act(() => speech.onFinal?.('Por que para?'));
    expect((document.getElementById('practice-question') as HTMLTextAreaElement).value).toBe('Por que para?');
  });

  it('shows the words arriving and a speech error', () => {
    speech.state = { isListening: true, isTranscribing: false, error: 'Microfone bloqueado' };
    render(<PracticeView session={practiceSession({ active: problem() })} />);
    expect(screen.getByTestId('dictation-overlay')).toBeDefined();
    expect(screen.getByTestId('practice-dictate').textContent).toContain('Ouvindo');
    expect(screen.getByText('Microfone bloqueado')).toBeDefined();
  });

  it('the shortcut event toggles it too', () => {
    render(<PracticeView session={practiceSession({ active: problem() })} />);
    act(() => void window.dispatchEvent(new CustomEvent('toggle-dictate')));
    expect(speech.toggle).toHaveBeenCalledTimes(1);
  });
});
