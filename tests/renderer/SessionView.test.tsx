import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionView } from '../../src/renderer/views/SessionView';
import { ProbingSession, ConceptNode } from '../../src/shared/types';

describe('SessionView Integration', () => {
  const initialNodes: ConceptNode[] = [
    {
      id: 'osi-l3-ttl',
      title: 'Time To Live (TTL)',
      summary: 'Decremento a cada salto.',
      level: 3,
      prerequisites: [],
      unconditionalTruth: 'Ao atingir 0 o pacote é descartado.',
      status: 'untested',
    },
  ];

  beforeEach(() => {
    // Setup mock window.api
    (window as any).api = {
      startSession: vi.fn().mockResolvedValue({
        id: 'sess-1',
        mode: 'teaching',
        phase: 'goal_orientation',
        goal: 'Camada 3',
        goalClarificationOptions: [
          'Aprofundar em TTL e Prevenção de Loops',
          'Tabela de Roteamento',
        ],
        questionCount: 0,
        frontierClarity: 0,
        attempts: [],
        socraticSteps: [],
        nodesState: { 'osi-l3-ttl': 'untested' },
      }),
      submitGoalClarification: vi.fn().mockResolvedValue({
        id: 'q-1',
        nodeId: 'osi-l3-ttl',
        questionText: 'O que acontece quando o TTL atinge 0?',
        options: [
          'Descarta e emite ICMP Time Exceeded',
          'Retransmite em loop',
          'Envia broadcast',
          'Ignora o cabeçalho',
        ],
        correctOptionIndex: 0,
        anchorConcept: 'TTL',
        difficulty: 3,
      }),
      submitProbeAnswer: vi.fn().mockResolvedValue({
        attempt: {
          questionId: 'q-1',
          nodeId: 'osi-l3-ttl',
          verdict: 'false_positive',
          judgeReasoning: 'Falso positivo detectado.',
        },
        nextAction: 'next_question',
        session: {
          id: 'sess-1',
          phase: 'probing',
          questionCount: 2,
          frontierClarity: 50,
          attempts: [],
          nodesState: { 'osi-l3-ttl': 'false_positive' },
        },
      }),
      advanceToDiagnosis: vi.fn().mockResolvedValue({
        id: 'sess-1',
        phase: 'frontier_diagnosis',
        questionCount: 8,
        frontierClarity: 100,
        nodesState: { 'osi-l3-ttl': 'false_positive' },
      }),
      startSocraticStep: vi.fn().mockResolvedValue({
        node: initialNodes[0],
        questionText: 'Como você impediria loops em roteadores?',
        promptGoal: 'Preveja o comportamento.',
      }),
      submitPrediction: vi.fn().mockResolvedValue({
        teachProse: 'Para evitar loops, o roteador decrementa o TTL.',
        checkQuestion: {
          questionText: 'O que acontece em TTL=1 no roteador?',
          options: ['Descarta', 'Renova', 'Ignora', 'Duplica'],
          correctOptionIndex: 0,
          explanation: 'O decremento resulta em 0 forçando o descarte.',
        },
      }),
      submitCheckAnswer: vi.fn().mockResolvedValue({
        isPassed: true,
        session: {
          id: 'sess-1',
          phase: 'completed',
          nodesState: { 'osi-l3-ttl': 'mastered' },
        },
      }),
      getGraphState: vi.fn().mockResolvedValue(initialNodes),
      getSession: vi.fn().mockResolvedValue({
        id: 'sess-1',
        phase: 'probing',
        questionCount: 1,
        frontierClarity: 0,
        attempts: [],
        nodesState: { 'osi-l3-ttl': 'untested' },
      }),
    };
  });

  it('renders initial goal orientation input and allows starting session', async () => {
    render(<SessionView initialNodes={initialNodes} />);

    expect(screen.getByText(/o que você quer dominar hoje\?/i)).toBeDefined();

    const input = screen.getByPlaceholderText(/ex: quero aprender a camada 3/i);
    fireEvent.change(input, { target: { value: 'Camada 3 e TTL' } });

    const startBtn = screen.getByRole('button', { name: /iniciar diagnóstico/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect((window as any).api.startSession).toHaveBeenCalledWith('teaching', 'Camada 3 e TTL');
      expect(screen.getByText('Aprofundar em TTL e Prevenção de Loops')).toBeDefined();
    });
  });

  it('transitions from goal clarification to active probing', async () => {
    render(<SessionView initialNodes={initialNodes} />);

    // Start
    const input = screen.getByPlaceholderText(/ex: quero aprender a camada 3/i);
    fireEvent.change(input, { target: { value: 'Camada 3 e TTL' } });
    fireEvent.click(screen.getByRole('button', { name: /iniciar diagnóstico/i }));

    await waitFor(() => {
      expect(screen.getByText('Aprofundar em TTL e Prevenção de Loops')).toBeDefined();
    });

    // Select clarification option
    fireEvent.click(screen.getByText('Aprofundar em TTL e Prevenção de Loops'));

    await waitFor(() => {
      expect((window as any).api.submitGoalClarification).toHaveBeenCalled();
      expect(screen.getByText('O que acontece quando o TTL atinge 0?')).toBeDefined();
    });
  });

  it('renders comprehensive frontier diagnosis metrics when phase is frontier_diagnosis', () => {
    const diagnosisSession: ProbingSession = {
      id: 'sess-diag',
      mode: 'teaching',
      disciplineId: 'osi-layer3',
      phase: 'frontier_diagnosis',
      goal: 'Camada 3 e TTL',
      questionCount: 8,
      frontierClarity: 100,
      attempts: [],
      socraticSteps: [],
      nodesState: { 'osi-l3-ttl': 'false_positive' },
    };

    render(
      <SessionView
        initialNodes={[
          {
            id: 'osi-l3-ttl',
            title: 'Time To Live (TTL)',
            summary: 'Decremento a cada salto.',
            level: 3,
            prerequisites: [],
            unconditionalTruth: 'Ao atingir 0 o pacote é descartado.',
            status: 'false_positive',
          },
        ]}
        currentSession={diagnosisSession}
      />
    );

    // Header and metrics should be rendered in the Chat tab
    expect(screen.getByText(/diagnóstico da fronteira cognitiva concluído/i)).toBeDefined();
    expect(screen.getAllByText(/falsos positivos/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /explorar no grafo dag/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /iniciar ensino socrático cirúrgico/i })).toBeDefined();
  });
});
