import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionView } from '../../src/renderer/views/SessionView';
import { ProbingSession, QuestionData } from '../../src/shared/types';

const question: QuestionData = {
  id: 'q1',
  nodeId: 'n1',
  questionText: 'Qual é a certa?',
  options: ['Opção certa', 'Opção errada', 'Outra', 'Mais uma'],
  correctOptionIndex: 0,
  anchorConcept: 'X',
  difficulty: 1,
};

const session = (over: Partial<ProbingSession> = {}): ProbingSession =>
  ({
    id: 's1',
    mode: 'teaching',
    disciplineId: 'd',
    goal: 'Tema',
    phase: 'probing',
    questionCount: 1,
    frontierClarity: 0,
    attempts: [],
    nodesState: { n1: 'untested' },
    currentQuestion: question,
    ...over,
  }) as ProbingSession;

const scoped = () =>
  session({
    phase: 'goal_orientation',
    currentQuestion: undefined,
    goalClarificationQuestion: 'Qual o foco?',
    goalClarificationOptions: ['Foco A', 'Foco B'],
  });

const ipcError = (msg: string) => new Error(`Error invoking remote method 'x': ${msg}`);
const field = (ph: RegExp) => screen.getByPlaceholderText(ph) as HTMLTextAreaElement;

describe('SessionView failure recovery', () => {
  beforeEach(() => {
    (window as any).api = {
      getGraphState: vi.fn().mockResolvedValue([]),
      getSession: vi.fn().mockResolvedValue(null),
      saveSessionUi: vi.fn().mockResolvedValue(undefined),
      cancelOperation: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('F2: a failed map generation brings the focus options and the typed text back', async () => {
    (window as any).api.submitGoalClarification = vi.fn().mockRejectedValue(ipcError('Error: tempo esgotado'));
    render(<SessionView currentSession={scoped()} />);

    fireEvent.click(await screen.findByText('Foco A'));
    fireEvent.change(field(/por que/i), { target: { value: 'meu motivo' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.getByText('Foco B')).toBeDefined();
    expect(field(/por que/i).value).toBe('meu motivo');
    expect(screen.queryByText(/Sua escolha/i)).toBeNull();
  });

  it('F2: a session saved in the stuck state opens with its options available', async () => {
    render(
      <SessionView
        currentSession={scoped()}
        restoredUi={{
          chatMessages: [],
          answeredScope: { questionText: 'Qual o foco?', options: ['Foco A', 'Foco B'], selectedOption: 'Foco A' },
        }}
      />
    );
    expect(await screen.findAllByRole('radio')).toHaveLength(3);
  });

  it('I1: the answer key and badge show before the judge finishes, and the reasoning survives a failure', async () => {
    let reject!: (e: Error) => void;
    (window as any).api.submitProbeAnswer = vi.fn(() => new Promise((_r, rej) => (reject = rej)));
    render(<SessionView currentSession={session()} />);

    fireEvent.click(await screen.findByText('Opção errada'));
    fireEvent.change(document.querySelector('textarea')!, { target: { value: 'meu raciocínio' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => expect((window as any).api.submitProbeAnswer).toHaveBeenCalled());
    await screen.findByText('Opção certa');
    expect(screen.getByText(/^errada$/i)).toBeDefined();
    expect(document.querySelector('.text-emerald-400')).not.toBeNull();

    await act(async () => reject(ipcError('JudgeUnavailableError: não avaliou')));

    expect(document.querySelector('textarea')!.value).toBe('meu raciocínio');
  });

  it('E7, U2: the error shows next to the field, without the class name', async () => {
    (window as any).api.submitProbeAnswer = vi.fn().mockRejectedValue(ipcError('ProviderLimitError: limite atingido (HTTP 429)'));
    render(<SessionView currentSession={session()} />);
    fireEvent.click(await screen.findByText('Opção errada'));
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('limite atingido');
    expect(alert.textContent).not.toContain('ProviderLimitError');
    expect(screen.getByTestId('status-region').contains(alert)).toBe(true);
    expect(screen.getByTestId('chat-feed-scroll').contains(alert)).toBe(false);
  });

  it('U8: a failed prediction leaves no bubble behind and keeps the text', async () => {
    (window as any).api.startSocraticStep = vi.fn().mockResolvedValue({
      node: { id: 'n1', title: 'Conceito', summary: '', level: 1, prerequisites: [], unconditionalTruth: '', status: 'frontier' },
      questionText: 'Qual seu palpite?',
      promptGoal: 'Preveja.',
    });
    (window as any).api.submitPrediction = vi.fn().mockRejectedValue(ipcError('Error: caiu'));
    render(<SessionView currentSession={session({ phase: 'teaching', currentQuestion: undefined })} />);
    await screen.findByText('Qual seu palpite?');

    const input = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'meu palpite' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

    await screen.findByRole('alert');
    expect(screen.queryByText('meu palpite', { ignore: 'textarea' })).toBeNull();
    expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe('meu palpite');
  });

  it('U8: a failed session start restores the topic and leaves no bubble', async () => {
    (window as any).api.startSession = vi.fn().mockRejectedValue(ipcError('Error: sem rede'));
    render(<SessionView />);
    fireEvent.change(field(/ex\.: equações/i), { target: { value: 'Meu tema' } });
    fireEvent.click(screen.getByRole('button', { name: /^começar$/i }));

    await screen.findByRole('alert');
    expect(field(/ex\.: equações/i).value).toBe('Meu tema');
    expect(screen.queryByText('Você')).toBeNull();
  });

  it('E1, U4: shows what is running with a cancel button; a cancel is not an error', async () => {
    let reject!: (e: Error) => void;
    (window as any).api.submitProbeAnswer = vi.fn(() => new Promise((_r, rej) => (reject = rej)));
    render(<SessionView currentSession={session()} />);
    fireEvent.click(await screen.findByText('Opção errada'));
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

    const status = await screen.findByRole('status');
    expect(status.textContent).toMatch(/lendo sua resposta/i);
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect((window as any).api.cancelOperation).toHaveBeenCalled();

    await act(async () => reject(ipcError('LLMCancelledError: Operação cancelada.')));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('Opção errada')).toBeDefined();
  });

  it('U5: a lesson that fails from the map shows the error there, with a retry', async () => {
    const node = { id: 'n1', title: 'Conceito', summary: 's', level: 1, prerequisites: [], unconditionalTruth: 'v', status: 'frontier' as const };
    (window as any).api.getGraphState = vi.fn().mockResolvedValue([node]);
    (window as any).api.startSocraticStep = vi.fn().mockRejectedValue(ipcError('Error: caiu'));
    render(<SessionView currentSession={session({ phase: 'teaching', currentQuestion: undefined })} />);
    await screen.findByRole('alert');

    fireEvent.click(screen.getByRole('button', { name: /mapa de conceitos/i }));
    await screen.findByRole('alert');
    (window as any).api.startSocraticStep.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    await waitFor(() => expect((window as any).api.startSocraticStep).toHaveBeenCalledTimes(1));
  });

  it('I11: the plan banner counts answered questions', async () => {
    const attempt = { questionId: 'q', nodeId: 'n1', questionText: 'Q', options: ['a', 'b'], correctOptionIndex: 0, selectedOptionIndex: 0, thinkingText: 't', verdict: 'mastered', judgeReasoning: 'r' };
    render(<SessionView currentSession={session({ questionCount: 3, attempts: [attempt, attempt] as any })} minQuestions={3} />);
    await screen.findByText('Qual é a certa?');
    expect(screen.queryByText(/já respondeu/i)).toBeNull();
  });
});
