import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../src/renderer/App';
import { PersistedUi, ProbingSession } from '../../src/shared/types';

const baseSession = (over: Partial<ProbingSession>): ProbingSession =>
  ({
    id: 's',
    mode: 'teaching',
    disciplineId: 'd',
    phase: 'goal_orientation',
    goal: 'Tema',
    questionCount: 0,
    frontierClarity: 0,
    attempts: [],
    socraticSteps: [],
    nodesState: {},
    goalClarificationOptions: [],
    ...over,
  }) as ProbingSession;

const savedScope = {
  questionText: 'Qual o foco antigo?',
  options: ['Foco antigo 1', 'Foco antigo 2'],
  selectedOption: 'Foco antigo 1',
};

const probing = baseSession({
  id: 'old',
  goal: 'Foco antigo 1',
  topic: 'Sessão salva',
  phase: 'probing',
  questionCount: 1,
  currentQuestion: {
    id: 'q1',
    nodeId: 'n1',
    questionText: 'Pergunta da sessão salva?',
    options: ['A', 'B', 'C', 'D'],
    correctOptionIndex: 0,
    anchorConcept: 'X',
    difficulty: 1,
  },
});

const oldUi: PersistedUi = {
  chatMessages: [{ id: 'm1', role: 'user', text: 'Mensagem antiga', afterAttemptCount: -1, timestamp: 1 }],
  answeredScope: savedScope,
};

const list = [
  { id: 'old', title: 'Sessão salva', mode: 'teaching' as const, updatedAt: 2 },
  { id: 'other', title: 'Outra sessão', mode: 'teaching' as const, updatedAt: 1 },
];

function setupApi(over: Record<string, unknown> = {}) {
  (window as any).api = {
    listSessions: vi.fn().mockResolvedValue(list),
    loadSession: vi.fn().mockImplementation((id: string) =>
      Promise.resolve(
        id === 'old'
          ? { session: probing, ui: oldUi }
          : {
              session: baseSession({ id: 'other', goal: 'Outra', phase: 'probing', questionCount: 1, currentQuestion: { ...probing.currentQuestion!, id: 'q2', questionText: 'Pergunta da outra?' } }),
              ui: { chatMessages: [] },
            }
      )
    ),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    saveSessionUi: vi.fn().mockResolvedValue(undefined),
    getGraphState: vi.fn().mockResolvedValue([]),
    getSession: vi.fn().mockResolvedValue(null),
    windowAction: vi.fn(),
    updateSettings: vi.fn().mockResolvedValue({ success: true }),
    startSession: vi.fn().mockImplementation((_m: string, goal: string) =>
      Promise.resolve(
        baseSession({
          id: 'new',
          goal,
          topic: goal,
          goalClarificationQuestion: 'Qual o foco novo?',
          goalClarificationOptions: ['Foco novo 1', 'Foco novo 2'],
        })
      )
    ),
    ...over,
  };
  localStorage.clear();
}

async function openSaved() {
  render(<App />);
  fireEvent.click(await screen.findByText('Sessão salva'));
  await screen.findByText('Pergunta da sessão salva?');
}

describe('App session navigation', () => {
  beforeEach(() => setupApi());

  it('F1: a new session after a saved one shows its own focus options', async () => {
    await openSaved();
    fireEvent.click(screen.getByText('+ Nova sessão'));
    fireEvent.change(screen.getByPlaceholderText(/ex\.: equações do 2º grau/i), { target: { value: 'Tema novo' } });
    fireEvent.click(screen.getByRole('button', { name: /^começar$/i }));

    await screen.findByText('Foco novo 1');
    expect(screen.queryByText('Qual o foco antigo?')).toBeNull();
    expect(screen.queryByText('Mensagem antiga')).toBeNull();
    // The goal the student just typed survives the moment the session receives its id
    expect(screen.getAllByText('Tema novo').length).toBeGreaterThan(0);
    const saved = (window as any).api.saveSessionUi.mock.calls.filter((c: any[]) => c[0] === 'new');
    for (const [, ui] of saved) expect(ui.answeredScope ?? null).toBeNull();
  });

  it('F4: opening another session replaces what was on screen', async () => {
    await openSaved();
    fireEvent.click(screen.getByText('Outra sessão'));
    await screen.findByText('Pergunta da outra?');
    expect(screen.queryByText('Pergunta da sessão salva?')).toBeNull();
    expect(screen.queryByText('Mensagem antiga')).toBeNull();
  });

  it('F5: going back to the current session after "+ Nova sessão" restores the conversation', async () => {
    await openSaved();
    fireEvent.click(screen.getByText('+ Nova sessão'));
    await waitFor(() => expect(screen.queryByText('Mensagem antiga')).toBeNull());
    fireEvent.click(screen.getByText('Sessão salva'));
    await screen.findByText('Mensagem antiga');
    expect((window as any).api.loadSession).toHaveBeenCalledTimes(2);
  });

  it('F12: a blank new session does not fetch the previous graph', async () => {
    await openSaved();
    const calls = (window as any).api.getGraphState.mock.calls.length;
    fireEvent.click(screen.getByText('+ Nova sessão'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect((window as any).api.getGraphState.mock.calls.length).toBe(calls);
  });

  it('F6: deleting the active session opens the next one', async () => {
    await openSaved();
    fireEvent.click(screen.getAllByTitle('Excluir sessão')[0]);
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await screen.findByText('Pergunta da outra?');
    expect((window as any).api.deleteSession).toHaveBeenCalledWith('old');
    expect(screen.queryByText('Sessão salva')).toBeNull();
  });

  it('E3: a session that fails to open shows the error and keeps the current one', async () => {
    await openSaved();
    (window as any).api.loadSession.mockRejectedValueOnce(
      new Error("Error invoking remote method 'session:load': Error: Sessão salva não encontrada.")
    );
    fireEvent.click(screen.getByText('Outra sessão'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Sessão salva não encontrada.');
    expect(screen.getByText('Pergunta da sessão salva?')).toBeDefined();
  });

  it('E3: a failure listing sessions is shown', async () => {
    setupApi({ listSessions: vi.fn().mockRejectedValue(new Error('disco indisponível')) });
    render(<App />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('disco indisponível');
  });

  it('F3: locks the sidebar while the AI is working', async () => {
    let finish!: (v: unknown) => void;
    (window as any).api.submitProbeAnswer = vi.fn(() => new Promise((r) => (finish = r)));
    await openSaved();

    fireEvent.click(screen.getByText('A'));
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => expect((window as any).api.submitProbeAnswer).toHaveBeenCalled());
    expect((screen.getByText('+ Nova sessão') as HTMLButtonElement).disabled).toBe(true);
    (window as any).api.loadSession.mockClear();
    fireEvent.click(screen.getByText('Outra sessão'));
    expect((window as any).api.loadSession).not.toHaveBeenCalled();

    await act(async () => {
      finish({ attempt: {}, nextAction: 'next_question', session: probing, nextQuestion: probing.currentQuestion });
    });
    expect((screen.getByText('+ Nova sessão') as HTMLButtonElement).disabled).toBe(false);
  });
});
