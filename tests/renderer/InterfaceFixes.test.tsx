import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionView } from '../../src/renderer/views/SessionView';
import { QuestionCard } from '../../src/renderer/components/QuestionCard';
import { CodeBlock, splitMath } from '../../src/renderer/components/RichText';
import { SettingsModal, DEFAULT_SETTINGS } from '../../src/renderer/components/SettingsModal';
import { KnowledgeGraph } from '../../src/renderer/components/KnowledgeGraph';
import { TitleBar } from '../../src/renderer/components/TitleBar';
import { I18nProvider } from '../../src/renderer/i18n';
import { pt } from '../../src/renderer/i18n/pt';
import { en } from '../../src/renderer/i18n/en';
import { ProbingSession } from '../../src/shared/types';

const question = {
  id: 'q1', nodeId: 'n1', questionText: 'Qual?', options: ['Primeira', 'Segunda'], correctOptionIndex: 0, anchorConcept: 'X', difficulty: 1,
};
const session = (over: Partial<ProbingSession> = {}) =>
  ({
    id: 's', mode: 'teaching', disciplineId: 'd', goal: 'Tema', phase: 'probing', questionCount: 1, frontierClarity: 0,
    attempts: [], nodesState: {}, currentQuestion: question, ...over,
  }) as ProbingSession;
const lessonNode = { id: 'n1', title: 'Conceito Um', summary: '', level: 1, prerequisites: [], unconditionalTruth: '', status: 'frontier' as const };

describe('interface fixes', () => {
  beforeEach(() => {
    (window as any).api = {
      getGraphState: vi.fn().mockResolvedValue([]),
      getSession: vi.fn().mockResolvedValue(null),
      saveSessionUi: vi.fn().mockResolvedValue(undefined),
      cancelOperation: vi.fn().mockResolvedValue(undefined),
      startSocraticStep: vi.fn().mockResolvedValue({ node: lessonNode, questionText: 'Palpite sobre isto?', promptGoal: 'Preveja.' }),
      submitPrediction: vi.fn().mockResolvedValue({
        teachProse: 'Explicação da aula.',
        checkQuestion: { questionText: 'Verifique?', options: ['Sim', 'Não'], correctOptionIndex: 0, explanation: 'x' },
      }),
      submitCheckAnswer: vi.fn().mockResolvedValue({ isPassed: true, session: session({ phase: 'teaching', currentQuestion: undefined }) }),
    };
  });

  it('U3: the conversation text can be selected', () => {
    render(<SessionView currentSession={session()} />);
    expect(screen.getByTestId('chat-feed-scroll').className).toContain('select-text');
  });

  it('U6: the explanation stays visible during the check and the lesson is kept for rereading', async () => {
    render(<SessionView currentSession={session({ phase: 'teaching', currentQuestion: undefined })} />);
    await screen.findByText('Palpite sobre isto?');
    fireEvent.change(document.querySelector('textarea')!, { target: { value: 'meu palpite' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    fireEvent.click(await screen.findByRole('button', { name: /verificar o que entendi/i }));

    await screen.findByText('Verifique?');
    expect(screen.getByText('Explicação da aula.')).toBeDefined();
    expect(screen.getByText('meu palpite')).toBeDefined();

    fireEvent.click(screen.getByText('Sim'));
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect((window as any).api.submitCheckAnswer).toHaveBeenCalled());
    await screen.findByRole('button', { name: /próximo conceito/i });

    await waitFor(() => {
      const saved = (window as any).api.saveSessionUi.mock.calls.at(-1)[1];
      expect(saved.lessons).toHaveLength(1);
      expect(saved.lessons[0]).toMatchObject({ title: 'Conceito Um', prediction: 'meu palpite', teachProse: 'Explicação da aula.', isPassed: true });
    });
  });

  it('U6: finished lessons of a saved session can be reread', () => {
    render(
      <SessionView
        currentSession={session({ phase: 'plan_review', currentQuestion: undefined })}
        restoredUi={{
          chatMessages: [],
          lessons: [{ nodeId: 'n', title: 'Aula Antiga', predictQuestion: 'p', prediction: 'g', teachProse: 'Texto antigo', checkQuestion: 'c', isPassed: false }],
        }}
      />
    );
    expect(screen.getByTestId('past-lesson').textContent).toContain('Aula Antiga');
    expect(screen.getByText('Texto antigo')).toBeDefined();
  });

  it('U7: no message field when nothing is expected from the student', () => {
    render(<SessionView currentSession={session({ phase: 'plan_review', plan: 'Plano', currentQuestion: undefined })} />);
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('U12: an alternative can be unselected', async () => {
    render(<SessionView currentSession={session()} />);
    const option = (await screen.findByText('Primeira')).closest('[role=radio]')!;
    fireEvent.click(option);
    expect(option.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(option);
    expect(option.getAttribute('aria-checked')).toBe('false');
  });

  it('U12: leaving "Não sei" gives the confidence back', async () => {
    render(<SessionView currentSession={session()} />);
    fireEvent.click(await screen.findByText(/não sei/i));
    fireEvent.click(screen.getByText('Primeira'));
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('50');
  });

  it('U12: comment colors follow the language', () => {
    const { container, rerender } = render(<CodeBlock code="ls --all // nada" lang="bash" />);
    expect(container.querySelector('.italic')).toBeNull();
    rerender(<CodeBlock code="SELECT 1 -- nota" lang="sql" />);
    expect(container.querySelector('.italic')?.textContent).toBe('-- nota');
    rerender(<CodeBlock code="let a; // nota" lang="ts" />);
    expect(container.querySelector('.italic')?.textContent).toBe('// nota');
  });

  it('U12: shell variables are not formulas', () => {
    expect(splitMath('$HOME/$USER').every((p) => p.type === 'text')).toBe(true);
  });

  it('U12: the maximize icon follows the real window state', async () => {
    let notify!: (v: boolean) => void;
    (window as any).api.onMaximizedChange = (cb: (v: boolean) => void) => {
      notify = cb;
      return () => {};
    };
    render(<TitleBar title="x" />);
    expect(screen.getByRole('button', { name: 'Maximizar' })).toBeDefined();
    React.act(() => notify(true));
    expect(screen.getByRole('button', { name: 'Restaurar' })).toBeDefined();
  });

  it('checklist: alternatives work from the keyboard', () => {
    const onSelect = vi.fn();
    const dontKnow = vi.fn();
    render(
      <QuestionCard label="L" questionText="Q" options={['a', 'b']} selectedIndex={0} onSelect={onSelect} dashedOption={{ label: 'Não sei', selected: false, onSelect: dontKnow }} />
    );
    expect(screen.getByRole('radiogroup')).toBeDefined();
    const [first, , dashed] = screen.getAllByRole('radio');
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(onSelect).toHaveBeenCalledWith(1);
    fireEvent.keyDown(dashed, { key: 'Enter' });
    expect(dontKnow).toHaveBeenCalled();
  });

  it('checklist: Escape closes the settings dialog', () => {
    const onClose = vi.fn();
    render(<SettingsModal isOpen onClose={onClose} onSave={vi.fn()} initialSettings={DEFAULT_SETTINGS} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('E2: dictation errors are shown', async () => {
    render(<SessionView currentSession={session()} />);
    (window as any).api.transcribeAudio = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockRejectedValue(new Error('negado')) } });
    fireEvent.click(screen.getByRole('button', { name: /ditado/i }));
    window.dispatchEvent(new CustomEvent('toggle-dictate'));
    expect(await screen.findByRole('alert')).toBeDefined();
  });

  it('I9: the map speaks English in English mode', () => {
    render(
      <I18nProvider lang="en">
        <KnowledgeGraph nodes={[{ ...lessonNode, status: 'untested' }]} />
      </I18nProvider>
    );
    expect(screen.getByText('GOAL')).toBeDefined();
    expect(screen.getByText(/solid line/i)).toBeDefined();
    expect(screen.getByText('Fit')).toBeDefined();
    expect(screen.queryByText('OBJETIVO')).toBeNull();
  });

  it('dictionaries keep the same keys and use the ellipsis character', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const v of [...Object.values(pt), ...Object.values(en)]) expect(v).not.toContain('...');
  });
});
