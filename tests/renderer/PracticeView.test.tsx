import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PracticeView } from '../../src/renderer/views/PracticeView';
import { SessionView } from '../../src/renderer/views/SessionView';
import App from '../../src/renderer/App';
import type { PracticeProblem, PracticeState, ProbingSession } from '../../src/shared/types';

const problem = (over: Partial<PracticeProblem> = {}): PracticeProblem => ({
  id: 'p1', statement: 'Enunciado do problema 1', targetIds: ['a'], mode: 'recall', difficulty: 1, turns: [], maxRung: -1, wrongClaims: 0, ...over,
});
const practiceSession = (practice: Partial<PracticeState> = {}): ProbingSession =>
  ({
    id: 's-practice', mode: 'practice', disciplineId: 'Recursão', goal: 'Recursão', phase: 'practice', questionCount: 1, frontierClarity: 0,
    attempts: [], nodesState: {},
    practice: { material: 'Recursão', targets: [{ id: 'a', title: 'Caso base', truth: 'Toda recursão precisa parar.' }], history: [], ...practice },
  }) as ProbingSession;
const api = () => (window as any).api;

describe('practice screen (A1)', () => {
  beforeEach(() => {
    (window as any).api = {
      cancelOperation: vi.fn().mockResolvedValue(undefined),
      practiceNext: vi.fn().mockResolvedValue(practiceSession({ active: problem() })),
      practiceSubmit: vi.fn(),
      practiceConclude: vi.fn(),
      practiceAsk: vi.fn(),
      practiceClose: vi.fn().mockResolvedValue(practiceSession({ closing: true })),
    };
  });

  it('a new practice session goes straight to its first problem', async () => {
    render(<PracticeView session={practiceSession()} />);
    await screen.findByText('Enunciado do problema 1');
    expect(api().practiceNext).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Caso base')).toBeDefined();
    expect(screen.getByTestId('practice-problem').textContent).toContain('Problema 1 · Recordar');
    // No solution on screen while the problem is open
    expect(screen.queryByText('Solução')).toBeNull();
  });

  it('a session reopened in the middle of a problem does not ask for another one', () => {
    render(<PracticeView session={practiceSession({ active: problem() })} />);
    expect(screen.getByText('Enunciado do problema 1')).toBeDefined();
    expect(api().practiceNext).not.toHaveBeenCalled();
  });

  it('asking for help works with an empty field and shows the rung used', async () => {
    const helped = problem({
      maxRung: 0,
      turns: [{ role: 'student', kind: 'work', text: '' }, { role: 'tutor', kind: 'hint', text: 'Releia o segundo dado.', rung: 0 }],
    });
    api().practiceSubmit.mockResolvedValue(practiceSession({ active: helped }));
    render(<PracticeView session={practiceSession({ active: problem() })} />);

    expect((screen.getByRole('button', { name: /entregar resposta/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /pedir ajuda/i }));
    await screen.findByText('Releia o segundo dado.');
    expect(api().practiceSubmit).toHaveBeenCalledWith('work', '');
    expect(screen.getByText('Ajuda · degrau 0 de 5')).toBeDefined();
    expect(screen.getByText('ajuda até o degrau 0 de 5')).toBeDefined();
  });

  it('a wrong answer keeps the problem open; a right one opens the pause with the solution', async () => {
    const wrong = problem({
      wrongClaims: 1,
      turns: [{ role: 'student', kind: 'claim', text: 'resposta 1' }, { role: 'tutor', kind: 'verdict', text: 'Confira a condição de parada.', correct: false }],
    });
    const solved = problem({
      outcome: 'solved', modelSolution: 'A solução completa.',
      turns: [...wrong.turns, { role: 'student', kind: 'claim', text: 'resposta 2' }, { role: 'tutor', kind: 'verdict', text: 'Isso: você usou o caso base.', correct: true }],
    });
    api().practiceSubmit.mockResolvedValueOnce(practiceSession({ active: wrong })).mockResolvedValueOnce(practiceSession({ history: [solved] }));
    render(<PracticeView session={practiceSession({ active: problem() })} />);

    fireEvent.change(screen.getByLabelText(/seu raciocínio ou sua resposta/i), { target: { value: 'resposta 1' } });
    fireEvent.click(screen.getByRole('button', { name: /entregar resposta/i }));
    await screen.findByText('Confira a condição de parada.');
    expect(api().practiceSubmit).toHaveBeenCalledWith('claim', 'resposta 1');
    expect(screen.getByText('Ainda não')).toBeDefined();
    expect(screen.getByTestId('practice-problem')).toBeDefined();
    expect(screen.queryByText('A solução completa.')).toBeNull();

    fireEvent.change(screen.getByLabelText(/seu raciocínio ou sua resposta/i), { target: { value: 'resposta 2' } });
    fireEvent.click(screen.getByRole('button', { name: /entregar resposta/i }));
    await screen.findByText('A solução completa.');
    expect(screen.queryByTestId('practice-problem')).toBeNull();
    expect(screen.getByTestId('practice-pause').textContent).toContain('resolvido');
    expect(screen.getByRole('button', { name: /próximo problema/i })).toBeDefined();
    // The next problem is the learner's call
    expect(api().practiceNext).not.toHaveBeenCalled();
  });

  it('seeing the solution asks for confirmation first', async () => {
    api().practiceConclude.mockResolvedValue(practiceSession({ history: [problem({ outcome: 'surrendered', modelSolution: 'A solução.' })] }));
    render(<PracticeView session={practiceSession({ active: problem() })} />);
    fireEvent.click(screen.getByRole('button', { name: /^ver a solução$/i }));
    expect(api().practiceConclude).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /ver mesmo assim/i }));
    await screen.findByText('A solução.');
    expect(api().practiceConclude).toHaveBeenCalledWith('surrendered');
    expect(screen.getByTestId('practice-pause').textContent).toContain('solução pedida');
  });

  it('the pause takes questions about the concluded problem and wraps up on request', async () => {
    const done = problem({ outcome: 'surrendered', modelSolution: 'A solução.' });
    const answered = { ...done, turns: [{ role: 'student' as const, kind: 'question' as const, text: 'por quê?' }, { role: 'tutor' as const, kind: 'answer' as const, text: 'Porque o caso base para a descida.' }] };
    api().practiceAsk.mockResolvedValue(practiceSession({ history: [answered] }));
    api().practiceNext.mockResolvedValue(practiceSession({ history: [answered], closing: true, active: problem({ id: 'p2', statement: 'Reteste em outra roupagem', retestOf: 'p1' }) }));
    render(<PracticeView session={practiceSession({ history: [done] })} />);

    fireEvent.change(screen.getByLabelText(/alguma dúvida sobre este problema/i), { target: { value: 'por quê?' } });
    fireEvent.click(screen.getByRole('button', { name: /^perguntar$/i }));
    await screen.findByText('Porque o caso base para a descida.');
    expect(api().practiceAsk).toHaveBeenCalledWith('por quê?');

    fireEvent.click(screen.getByRole('button', { name: /encerrar, revendo o que falhou/i }));
    await screen.findByText('Reteste em outra roupagem');
    expect(api().practiceClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('practice-problem').textContent).toContain('reteste');
    // The concluded problem stays available for rereading
    expect(screen.getByTestId('past-problem').textContent).toContain('Problema 1');
  });

  it('a failed call gives the text back and offers nothing destructive', async () => {
    api().practiceSubmit.mockRejectedValue(new Error("Error invoking remote method 'practice:submit': Error: Não foi possível conferir a resposta. Ela continua no campo: envie de novo."));
    render(<PracticeView session={practiceSession({ active: problem() })} />);
    const field = screen.getByLabelText(/seu raciocínio ou sua resposta/i) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: 'minha resposta' } });
    fireEvent.click(screen.getByRole('button', { name: /entregar resposta/i }));
    expect((await screen.findByRole('alert')).textContent).toContain('Ela continua no campo');
    await waitFor(() => expect(field.value).toBe('minha resposta'));
  });

  it('shows the end of the session', () => {
    render(<PracticeView session={practiceSession({ finished: true, closing: true, history: [problem({ outcome: 'solved', modelSolution: 's' }), problem({ id: 'p2', outcome: 'dismissed', modelSolution: 's' })] })} />);
    expect(screen.getByTestId('practice-finished').textContent).toContain('1 de 2');
    expect(screen.queryByRole('button', { name: /próximo/i })).toBeNull();
    expect(api().practiceNext).not.toHaveBeenCalled();
  });
});

describe('ways into practice (A1)', () => {
  const teaching = (over: Partial<ProbingSession> = {}): ProbingSession =>
    ({
      id: 's-teach', mode: 'teaching', disciplineId: 'd', goal: 'TCP e UDP', phase: 'teaching', questionCount: 3, frontierClarity: 100,
      attempts: [], nodesState: { n1: 'mastered', n2: 'frontier' }, ...over,
    }) as ProbingSession;
  const nodes = [
    { id: 'n1', title: 'Portas', summary: 's', level: 1, prerequisites: [], unconditionalTruth: 'Toda conexão tem uma porta.', status: 'mastered' as const },
    { id: 'n2', title: 'Handshake', summary: 's', level: 2, prerequisites: ['n1'], unconditionalTruth: 'v', status: 'frontier' as const },
  ];

  it('the lessons offer to practise what was already mastered, and only that', async () => {
    (window as any).api = {
      getGraphState: vi.fn().mockResolvedValue(nodes),
      getSession: vi.fn().mockResolvedValue(null),
      saveSessionUi: vi.fn().mockResolvedValue(undefined),
      cancelOperation: vi.fn().mockResolvedValue(undefined),
      startSocraticStep: vi.fn().mockResolvedValue(null),
    };
    const onStartPractice = vi.fn();
    render(<SessionView currentSession={teaching()} initialNodes={nodes} onStartPractice={onStartPractice} />);
    fireEvent.click(await screen.findByTestId('start-practice'));
    expect(onStartPractice).toHaveBeenCalledWith({
      material: 'TCP e UDP',
      sourceSessionId: 's-teach',
      targets: [{ id: 'n1', title: 'Portas', truth: 'Toda conexão tem uma porta.' }],
    });
  });

  it('nothing to practise before a concept is mastered', async () => {
    (window as any).api = {
      getGraphState: vi.fn().mockResolvedValue(nodes),
      getSession: vi.fn().mockResolvedValue(null),
      saveSessionUi: vi.fn().mockResolvedValue(undefined),
      cancelOperation: vi.fn().mockResolvedValue(undefined),
      startSocraticStep: vi.fn().mockResolvedValue(null),
    };
    render(<SessionView currentSession={teaching({ nodesState: { n1: 'frontier', n2: 'frontier' } })} initialNodes={nodes} onStartPractice={vi.fn()} />);
    await screen.findByTestId('teaching-finished');
    expect(screen.queryByTestId('start-practice')).toBeNull();
  });

  it('a blank session can be turned into free practice of a topic', async () => {
    const created = practiceSession({ targets: [] });
    (window as any).api = {
      listSessions: vi.fn().mockResolvedValue([]),
      getGraphState: vi.fn().mockResolvedValue([]),
      getSession: vi.fn().mockResolvedValue(null),
      saveSessionUi: vi.fn().mockResolvedValue(undefined),
      cancelOperation: vi.fn().mockResolvedValue(undefined),
      updateSettings: vi.fn().mockResolvedValue({ success: true }),
      startSession: vi.fn(),
      startPractice: vi.fn().mockResolvedValue(created),
      practiceNext: vi.fn().mockResolvedValue({ ...created, practice: { ...created.practice!, active: problem() } }),
    };
    render(<App />);
    const choice = await screen.findByRole('radio', { name: /praticar/i });
    expect(choice.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(choice);
    expect(choice.getAttribute('aria-checked')).toBe('true');

    fireEvent.change(screen.getByPlaceholderText(/tema que você quer praticar/i), { target: { value: 'Recursão' } });
    fireEvent.click(screen.getByRole('button', { name: /^começar$/i }));

    await screen.findByText('Enunciado do problema 1');
    expect(api().startPractice).toHaveBeenCalledWith({ material: 'Recursão' });
    expect(api().startSession).not.toHaveBeenCalled();
    // The new session is listed, marked as practice
    expect(screen.getAllByText('Prática').length).toBeGreaterThan(0);
  });
});
