import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionView } from '../../src/renderer/views/SessionView';
import type { LessonProgress, ProbingSession } from '../../src/shared/types';

const session = (over: Partial<ProbingSession> = {}) =>
  ({
    id: 's', mode: 'teaching', disciplineId: 'd', goal: 'Tema', phase: 'teaching', questionCount: 3, frontierClarity: 100,
    attempts: [], nodesState: { n1: 'frontier' }, ...over,
  }) as ProbingSession;
const node = { id: 'n1', title: 'Conceito Um', summary: '', level: 1, prerequisites: [], unconditionalTruth: '', status: 'frontier' as const };
const check = (text: string) => ({ questionText: text, options: ['Sim', 'Não'], correctOptionIndex: 0, explanation: 'porque sim' });
const progress = (over: Partial<LessonProgress> = {}): LessonProgress => ({
  steps: ['Fato 1', 'Fato 2'], stepIndex: 0, retries: 0, prediction: 'meu palpite', taught: [{ step: 0, prose: 'Explicação do passo 1.' }], ...over,
});

const api = () => (window as any).api;
const send = () => fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

describe('lessons in steps (D2, A7)', () => {
  beforeEach(() => {
    (window as any).api = {
      getGraphState: vi.fn().mockResolvedValue([]),
      getSession: vi.fn().mockResolvedValue(null),
      saveSessionUi: vi.fn().mockResolvedValue(undefined),
      cancelOperation: vi.fn().mockResolvedValue(undefined),
      resumeLesson: vi.fn().mockResolvedValue(undefined),
      startSocraticStep: vi.fn().mockResolvedValue({ node, questionText: 'Palpite sobre isto?', promptGoal: 'Preveja.' }),
      submitPrediction: vi.fn().mockResolvedValue({
        teachProse: 'Explicação do passo 1.',
        checkQuestion: check('Verificação 1?'),
        progress: progress(),
      }),
      submitCheckAnswer: vi.fn().mockResolvedValue({
        isPassed: true, mastered: true, outcome: 'next_step', progress: progress({ stepIndex: 1 }), session: session(),
      }),
      continueLesson: vi.fn().mockResolvedValue({
        teachProse: 'Explicação do passo 2.',
        checkQuestion: check('Verificação 2?'),
        progress: progress({ stepIndex: 1, taught: [{ step: 0, prose: 'Explicação do passo 1.' }, { step: 1, prose: 'Explicação do passo 2.' }] }),
        isRetry: false,
      }),
    };
  });

  const toFirstCheck = async () => {
    render(<SessionView currentSession={session()} />);
    await screen.findByText('Palpite sobre isto?');
    fireEvent.change(document.querySelector('textarea')!, { target: { value: 'meu palpite' } });
    send();
    fireEvent.click(await screen.findByRole('button', { name: /verificar o que entendi/i }));
    await screen.findByText('Verificação 1?');
  };

  it('a demonstrated step leads to the next step of the same concept, not to the next concept', async () => {
    await toFirstCheck();
    expect(screen.getByTestId('lesson-step').textContent).toBe('Passo 1 de 2');

    fireEvent.click(screen.getByText('Sim'));
    send();
    fireEvent.click(await screen.findByRole('button', { name: /próximo passo/i }));

    await screen.findByText('Explicação do passo 2.');
    expect(api().continueLesson).toHaveBeenCalledTimes(1);
    expect(api().startSocraticStep).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('lesson-step').textContent).toBe('Passo 2 de 2');
    // The invitation to guess is gone with the opening of the lesson
    expect(screen.queryByText(/quero ouvir o seu palpite/i)).toBeNull();
    // The guess opened the lesson: it is not asked again, and the first step stays for rereading
    expect(screen.getAllByText('Palpite sobre isto?')).toHaveLength(1);
    expect(screen.getByTestId('past-lesson').textContent).toContain('Passo 1 de 2');

    // The last step ends the concept
    api().submitCheckAnswer.mockResolvedValue({ isPassed: true, mastered: true, outcome: 'concept_mastered', session: session() });
    fireEvent.click(screen.getByRole('button', { name: /verificar o que entendi/i }));
    await screen.findByText('Verificação 2?');
    fireEvent.click(screen.getByText('Sim'));
    send();
    await screen.findByRole('button', { name: /próximo conceito/i });

    await waitFor(() => {
      const saved = api().saveSessionUi.mock.calls.at(-1)[1];
      expect(saved.lessons).toHaveLength(2);
      expect(saved.lessons[0]).toMatchObject({ stepIndex: 0, stepCount: 2, prediction: 'meu palpite', predictQuestion: 'Palpite sobre isto?' });
      expect(saved.lessons[1]).toMatchObject({ stepIndex: 1, stepCount: 2, prediction: '', predictQuestion: '', teachProse: 'Explicação do passo 2.' });
      expect(saved.activeLesson).toBeNull();
    });
  });

  it('a missed step is explained again, and what the student thought while reading goes in its own channel', async () => {
    api().submitCheckAnswer.mockResolvedValue({
      isPassed: false, mastered: false, outcome: 'retry_step', progress: progress({ retries: 1 }), repairExplanation: 'A certa era Sim.', session: session(),
    });
    api().continueLesson.mockResolvedValue({
      teachProse: 'Outra explicação do passo 1.', checkQuestion: check('Verificação 1b?'), progress: progress({ retries: 1 }), isRetry: true,
    });
    await toFirstCheck();

    fireEvent.change(screen.getByLabelText(/enquanto você lia/i), { target: { value: 'o exemplo me confundiu' } });
    fireEvent.change(screen.getByLabelText(/seu raciocínio/i), { target: { value: 'chutei' } });
    fireEvent.click(screen.getByText('Não'));
    send();

    await waitFor(() => expect(api().submitCheckAnswer).toHaveBeenCalledWith(1, 50, 'chutei', 'o exemplo me confundiu'));
    fireEvent.click(await screen.findByRole('button', { name: /ver este passo de outro jeito/i }));

    await screen.findByText('Outra explicação do passo 1.');
    expect(screen.getByText(/explicação, de outro jeito/i)).toBeDefined();
    expect(screen.getByTestId('lesson-step').textContent).toBe('Passo 1 de 2');
    // Each verification starts with an empty reading field
    fireEvent.click(screen.getByRole('button', { name: /verificar o que entendi/i }));
    await screen.findByText('Verificação 1b?');
    expect((screen.getByLabelText(/enquanto você lia/i) as HTMLTextAreaElement).value).toBe('');
  });

  it('the reading field only exists on a lesson verification', async () => {
    render(<SessionView currentSession={session()} />);
    await screen.findByText('Palpite sobre isto?');
    expect(screen.queryByLabelText(/enquanto você lia/i)).toBeNull();
  });

  it('a lesson closed halfway reopens on the step and screen where it stopped', async () => {
    render(
      <SessionView
        currentSession={session()}
        restoredUi={{
          chatMessages: [],
          activeLesson: {
            node, questionText: 'Palpite sobre isto?', step: 'check', prediction: 'meu palpite',
            teachProse: 'Explicação do passo 2.', checkQuestion: check('Verificação 2?'),
            progress: progress({ stepIndex: 1 }),
          },
        }}
      />
    );
    await screen.findByText('Verificação 2?');
    expect(screen.getByText('Explicação do passo 2.')).toBeDefined();
    expect(screen.getByTestId('lesson-step').textContent).toBe('Passo 2 de 2');
    expect(api().resumeLesson).toHaveBeenCalledWith('n1', check('Verificação 2?'), progress({ stepIndex: 1 }));
    expect(api().startSocraticStep).not.toHaveBeenCalled();
    expect(api().continueLesson).not.toHaveBeenCalled();
  });

  it('a lesson closed between a verification and the next explanation asks for that explanation', async () => {
    render(
      <SessionView
        currentSession={session()}
        restoredUi={{
          chatMessages: [],
          activeLesson: {
            node, questionText: 'Palpite sobre isto?', step: 'continue', prediction: 'meu palpite',
            teachProse: 'Explicação do passo 1.', checkQuestion: check('Verificação 1?'),
            progress: progress({ stepIndex: 1 }),
          },
        }}
      />
    );
    await screen.findByText('Explicação do passo 2.');
    expect(api().resumeLesson).toHaveBeenCalledWith('n1', null, progress({ stepIndex: 1 }));
    expect(api().continueLesson).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Verificação 1?')).toBeNull();
  });

  it('a lesson saved before steps existed still opens and ends on its single verification', async () => {
    api().submitPrediction.mockResolvedValue({ teachProse: 'Explicação antiga.', checkQuestion: check('Verificação?') });
    api().submitCheckAnswer.mockResolvedValue({ isPassed: true, mastered: true, session: session() });
    render(<SessionView currentSession={session()} />);
    await screen.findByText('Palpite sobre isto?');
    fireEvent.change(document.querySelector('textarea')!, { target: { value: 'palpite' } });
    send();
    fireEvent.click(await screen.findByRole('button', { name: /verificar o que entendi/i }));
    await screen.findByText('Verificação?');
    expect(screen.queryByTestId('lesson-step')).toBeNull();
    fireEvent.click(screen.getByText('Sim'));
    send();
    await screen.findByRole('button', { name: /próximo conceito/i });
  });
});
