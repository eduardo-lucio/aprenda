import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionView } from '../../src/renderer/views/SessionView';
import { ProbingSession, ConceptNode, ModelOption } from '../../src/shared/types';

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
      advanceToPlan: vi.fn().mockResolvedValue({
        id: 'sess-1',
        phase: 'plan_review',
        plan: 'Plano de teste.',
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
          phase: 'teaching',
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

    expect(screen.getByRole('heading', { name: /o que você quer aprender/i })).toBeDefined();
    expect(screen.getByText(/antes de explicar qualquer coisa, eu vou descobrir o que você já sabe/i)).toBeDefined();
    expect(screen.getByTestId('hero-graph')).toBeDefined();

    const input = screen.getByPlaceholderText(/ex\.: equações do 2º grau/i);
    fireEvent.change(input, { target: { value: 'Camada 3 e TTL' } });

    const startBtn = screen.getByRole('button', { name: /^começar$/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect((window as any).api.startSession).toHaveBeenCalledWith('teaching', 'Camada 3 e TTL');
      expect(screen.getByText('Aprofundar em TTL e Prevenção de Loops')).toBeDefined();
    });
    expect(screen.queryByTestId('hero-graph')).toBeNull();
    expect(screen.queryByRole('heading', { name: /o que você quer aprender/i })).toBeNull();
  });

  it('brings the centred field back with the text when the session fails to start', async () => {
    (window as any).api.startSession = vi.fn().mockRejectedValue(new Error('sem conexão'));
    render(<SessionView initialNodes={initialNodes} />);

    fireEvent.change(screen.getByPlaceholderText(/ex\.: equações do 2º grau/i), { target: { value: 'Tema' } });
    fireEvent.click(screen.getByRole('button', { name: /^começar$/i }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('sem conexão'));
    expect((screen.getByPlaceholderText(/ex\.: equações do 2º grau/i) as HTMLTextAreaElement).value).toBe('Tema');
    expect(screen.getByTestId('hero-graph').getAttribute('class')).toContain('opacity-100');
  });

  it('transitions from goal clarification to active probing', async () => {
    render(<SessionView initialNodes={initialNodes} />);

    // Start
    const input = screen.getByPlaceholderText(/ex\.: equações do 2º grau/i);
    fireEvent.change(input, { target: { value: 'Camada 3 e TTL' } });
    fireEvent.click(screen.getByRole('button', { name: /^começar$/i }));

    await waitFor(() => {
      expect(screen.getByText('Aprofundar em TTL e Prevenção de Loops')).toBeDefined();
    });

    // Select clarification option and submit
    fireEvent.click(screen.getByText('Aprofundar em TTL e Prevenção de Loops'));
    fireEvent.click(screen.getByRole('button', { name: /^enviar resposta$/i }));

    await waitFor(() => {
      expect((window as any).api.submitGoalClarification).toHaveBeenCalled();
      expect(screen.getByText('O que acontece quando o TTL atinge 0?')).toBeDefined();
    });
  });

  it('renders the plan review screen with the plan text and a start-teaching button, without diagnosis', () => {
    const planSession: ProbingSession = {
      id: 'sess-plan',
      mode: 'teaching',
      disciplineId: 'osi-layer3',
      phase: 'plan_review',
      goal: 'Camada 3 e TTL',
      plan: 'Começaremos pelo TTL, que a sondagem mostrou frágil.',
      questionCount: 8,
      frontierClarity: 100,
      attempts: [],
      nodesState: { 'osi-l3-ttl': 'false_positive' },
    };

    render(<SessionView initialNodes={initialNodes} currentSession={planSession} />);

    expect(screen.getByText(/começaremos pelo ttl/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /começar as aulas/i })).toBeDefined();
    expect(screen.queryByText(/diagnóstico da fronteira/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /iniciar ensino socrático/i })).toBeNull();

    // No tiny embedded graph: a button opens the concept map tab instead
    expect(screen.queryByRole('img', { name: /mapa de conceitos/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /ver mapa de conceitos/i }));
    expect(screen.getByRole('img', { name: /mapa de conceitos/i })).toBeDefined();
  });

  it('renders vertical chat feed with previous answered questions, collapsible AGENT THINKING blocks, and bottom chat input', () => {
    const probingSessionWithHistory: ProbingSession = {
      id: 'sess-chat',
      mode: 'teaching',
      disciplineId: 'osi-layer3',
      phase: 'probing',
      goal: 'Camada 3 e Roteamento',
      questionCount: 2,
      frontierClarity: 25,
      attempts: [
        {
          questionId: 'q-prev-1',
          nodeId: 'osi-context',
          questionText: 'Qual é o propósito da Camada 3 (Camada de Rede) no modelo OSI?',
          options: [
            'Gerenciar conexões de usuário (Camada 7)',
            'Transporte de dados entre aplicações (Camada 4)',
            'Encaminhar pacotes entre redes diferentes (roteamento)',
            'Conexão física de dispositivos (Camada 1)',
          ],
          correctOptionIndex: 2,
          selectedOptionIndex: 2,
          confidence: 100,
          thinkingText: 'A camada 3 roteia pacotes entre sub-redes distintas.',
          verdict: 'mastered',
          agentThinking: 'Nota do tutor sobre esta resposta.',
          judgeReasoning: 'Raciocínio causal perfeito sobre roteamento inter-redes.',
        },
      ],
      nodesState: { 'osi-context': 'mastered', 'osi-l3-ttl': 'untested' },
      currentQuestion: {
        id: 'q-active-2',
        nodeId: 'osi-l3-ttl',
        questionText: 'Como o IP determina se um host de destino está na mesma rede local?',
        options: [
          'Comparando o IP de destino com a máscara de sub-rede',
          'Enviando um ARP broadcast',
          'Consultando a tabela DNS',
          'Verificando o endereço MAC',
        ],
        correctOptionIndex: 0,
        anchorConcept: 'Máscara de Sub-rede',
        difficulty: 2,
      },
    };

    render(<SessionView initialNodes={initialNodes} currentSession={probingSessionWithHistory} />);

    // Previous answered question remains in the feed above
    expect(
      screen.getByText('Qual é o propósito da Camada 3 (Camada de Rede) no modelo OSI?')
    ).toBeDefined();
    expect(screen.getByText('Certa')).toBeDefined();
    expect(screen.getByText('A camada 3 roteia pacotes entre sub-redes distintas.')).toBeDefined();

    // Active question is rendered below it
    expect(
      screen.getByText('Como o IP determina se um host de destino está na mesma rede local?')
    ).toBeDefined();

    // Multiple AGENT'S THINKING blocks exist between turns
    const thinkingToggles = screen.getAllByText(/raciocínio do tutor/i);
    expect(thinkingToggles.length).toBeGreaterThanOrEqual(2);

    // Bottom chat input bar is rendered
    expect(
      screen.getByPlaceholderText(/escreva seu raciocínio ou sua própria resposta/i)
    ).toBeDefined();
  });

  it('displays real calculated session tokens instead of hardcoded 1420', () => {
    // Before session or with 0 tokens used
    const { rerender } = render(<SessionView initialNodes={initialNodes} tokenCount={0} />);
    expect(screen.getByText('0 tok')).toBeDefined();
    expect(screen.queryByText('1.420 tok')).toBeNull();

    // After session accumulated real tokens
    rerender(<SessionView initialNodes={initialNodes} tokenCount={3850} />);
    expect(screen.getByText('3.850 tok')).toBeDefined();
    expect(screen.queryByText('1.420 tok')).toBeNull();
  });

  it('opens model selector matching Image 3 with search, active provider models, pricing, context, and configure models button', () => {
    const mockModels: ModelOption[] = [
      {
        id: 'z-ai/glm-5.3-flashx-legal',
        name: 'Z.ai: GLM 5.3 FlashX Legal',
        provider: 'openrouter',
        slug: '~z-ai/glm-5.3-flashx-legal',
        price: '$0.37/$1.25',
        context: '104k',
        defaultEffort: 'medium',
      },
      {
        id: 'particle-ai/particle-1',
        name: 'Particle AI: Particle-1',
        provider: 'openrouter',
        slug: '~particle-ai/particle-1',
        price: '$0.05/$0.50',
        context: '104k',
        defaultEffort: 'medium',
      },
    ];

    const onChangeModelMock = vi.fn();
    const onOpenSettingsMock = vi.fn();

    render(
      <SessionView
        initialNodes={initialNodes}
        modelName="z-ai/glm-5.3-flashx-legal"
        availableModels={mockModels}
        onChangeModel={onChangeModelMock}
        onOpenSettings={onOpenSettingsMock}
      />
    );

    // Click the model pill button
    const modelPillBtn = screen.getByTitle(/modelo: z-ai\/glm-5.3-flashx-legal/i);
    fireEvent.click(modelPillBtn);

    // Search bar matching Image 3 is visible
    const searchInput = screen.getByPlaceholderText('Buscar modelos…');
    expect(searchInput).toBeDefined();

    // Model items matching Image 3 are displayed
    expect(screen.getByText('Z.ai: GLM 5.3 FlashX Legal')).toBeDefined();
    expect(screen.getByText('$0.37/$1.25')).toBeDefined();
    expect(screen.getByText(/openrouter · ~z-ai\/glm-5.3-flashx-legal · 104k/)).toBeDefined();

    expect(screen.getByText('Particle AI: Particle-1')).toBeDefined();
    expect(screen.getByText('$0.05/$0.50')).toBeDefined();

    // Configure models button at bottom is present
    const configureBtn = screen.getByText(/configurar modelos…/i);
    expect(configureBtn).toBeDefined();
    fireEvent.click(configureBtn);
    expect(onOpenSettingsMock).toHaveBeenCalled();

    // Reopen and search
    fireEvent.click(modelPillBtn);
    const searchInput2 = screen.getByPlaceholderText('Buscar modelos…');
    fireEvent.change(searchInput2, { target: { value: 'Particle' } });

    // Filtered results
    expect(screen.getByText('Particle AI: Particle-1')).toBeDefined();
    expect(screen.queryByText('Z.ai: GLM 5.3 FlashX Legal')).toBeNull();

    // Select the model
    fireEvent.click(screen.getByText('Particle AI: Particle-1'));
    expect(onChangeModelMock).toHaveBeenCalledWith('particle-ai/particle-1');
  });

  const probingSession: ProbingSession = {
    id: 'sess-dock',
    mode: 'teaching',
    disciplineId: 'osi-layer3',
    phase: 'probing',
    goal: 'Camada 3',
    questionCount: 3,
    frontierClarity: 10,
    attempts: [],
    nodesState: { 'osi-l3-ttl': 'untested' },
    currentQuestion: {
      id: 'q-dock',
      nodeId: 'osi-l3-ttl',
      questionText: 'O que acontece quando o TTL chega a 0?',
      options: ['Descarta o pacote', 'Retransmite', 'Duplica', 'Ignora'],
      correctOptionIndex: 0,
      anchorConcept: 'TTL',
      difficulty: 2,
    },
  };

  it('renders the probe question as a single card with confidence slider and one reasoning field', async () => {
    render(<SessionView initialNodes={initialNodes} currentSession={probingSession} />);

    // Single text field + confidence slider above it; no second reasoning field
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getAllByText(/seu raciocínio/i)).toHaveLength(1);
    expect(screen.getByText('Confiança')).toBeDefined();
    expect(screen.getByText('Não sei / ainda não aprendi isso')).toBeDefined();

    // Nothing chosen yet: send is disabled and placeholder invites own answer / thinking
    const send = screen.getByRole('button', { name: /^enviar resposta$/i }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(screen.getByPlaceholderText(/escreva seu raciocínio ou sua própria resposta/i)).toBeDefined();

    // Choosing an option enables send even with empty (optional) reasoning
    fireEvent.click(screen.getByText('Descarta o pacote'));
    expect(send.disabled).toBe(false);
    expect(screen.getByPlaceholderText(/explique seu raciocínio \(opcional\)/i)).toBeDefined();

    fireEvent.change(screen.getByRole('slider'), { target: { value: '4' } });
    fireEvent.click(send);

    await waitFor(() => {
      expect((window as any).api.submitProbeAnswer).toHaveBeenCalledWith({
        selectedOptionIndex: 0,
        confidence: 90,
        thinkingText: '',
      });
    });
  });

  it('sends the typed chat text as the reasoning of the selected alternative', async () => {
    render(<SessionView initialNodes={initialNodes} currentSession={probingSession} />);
    fireEvent.click(screen.getByText('Retransmite'));
    fireEvent.change(screen.getByPlaceholderText(/explique seu raciocínio/i), {
      target: { value: 'Porque o roteador reenvia sempre.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^enviar resposta$/i }));

    await waitFor(() => {
      expect((window as any).api.submitProbeAnswer).toHaveBeenCalledWith({
        selectedOptionIndex: 1,
        confidence: undefined,
        thinkingText: 'Porque o roteador reenvia sempre.',
      });
    });
  });

  it('does not send confidence when the student answers "Não sei"', async () => {
    render(<SessionView initialNodes={initialNodes} currentSession={probingSession} />);
    fireEvent.click(screen.getByText('Não sei / ainda não aprendi isso'));
    fireEvent.click(screen.getByRole('button', { name: /^enviar resposta$/i }));

    await waitFor(() => {
      const arg = (window as any).api.submitProbeAnswer.mock.calls[0][0];
      expect(arg.selectedOptionIndex).toBe(-1);
      expect(arg.confidence).toBeUndefined();
      expect(arg.answerKind).toBeUndefined();
    });
  });

  it('treats text typed without choosing an alternative as the student\'s own answer', async () => {
    render(<SessionView initialNodes={initialNodes} currentSession={probingSession} />);
    fireEvent.change(screen.getByPlaceholderText(/escreva seu raciocínio ou sua própria resposta/i), {
      target: { value: 'O pacote some e o roteador avisa a origem.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^enviar resposta$/i }));

    await waitFor(() => {
      expect((window as any).api.submitProbeAnswer).toHaveBeenCalledWith({
        selectedOptionIndex: -1,
        answerKind: 'own_answer',
        confidence: undefined,
        thinkingText: 'O pacote some e o roteador avisa a origem.',
      });
    });
  });

  it('renders the scope question as a single card and asks for a custom scope in its field (no confidence slider)', async () => {
    render(<SessionView initialNodes={initialNodes} />);
    fireEvent.change(screen.getByPlaceholderText(/ex\.: equações do 2º grau/i), {
      target: { value: 'Camada 3 e TTL' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^começar$/i }));

    await waitFor(() => {
      expect(screen.getByText('Tabela de Roteamento')).toBeDefined();
    });
    expect(screen.queryByText('Confiança')).toBeNull();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);

    // Free-text custom scope typed in the chat field
    const input = screen.getByPlaceholderText(/ou descreva o foco com suas palavras/i);
    fireEvent.change(input, { target: { value: 'Só o ICMP' } });
    fireEvent.click(screen.getByRole('button', { name: /^enviar resposta$/i }));

    await waitFor(() => {
      expect((window as any).api.submitGoalClarification).toHaveBeenCalledWith('Só o ICMP', '');
    });
  });

  it('keeps the active question, confidence, reasoning field and submit button in ONE in-flow card inside the feed', () => {
    render(<SessionView initialNodes={initialNodes} currentSession={probingSession} />);

    const feed = screen.getByTestId('chat-feed-scroll');
    const card = screen.getByTestId('probe-card');

    // The card is part of the scrolling feed (no floating dock, no collapsed pill)
    expect(feed.contains(card)).toBe(true);
    expect(screen.queryByTestId('collapsed-question-pill')).toBeNull();
    expect(screen.queryByTestId('active-question-dock')).toBeNull();

    expect(card.textContent).toContain('Descarta o pacote');
    expect(card.textContent).toContain('Confiança');
    expect(card.querySelector('textarea')).not.toBeNull();
    expect(screen.getByRole('button', { name: /^enviar resposta$/i })).toBeDefined();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('turns the question into an answered card (no feedback banner) while the AI is thinking', async () => {
    let resolveProbe!: (val: any) => void;
    (window as any).api.submitProbeAnswer = vi.fn().mockImplementation(
      () => new Promise((r) => { resolveProbe = r; })
    );

    render(<SessionView initialNodes={initialNodes} currentSession={probingSession} />);

    // Only 1 AGENT'S THINKING block for the single active probe turn
    expect(screen.getAllByText(/raciocínio do tutor/i)).toHaveLength(1);

    fireEvent.click(screen.getByText('Descarta o pacote'));
    fireEvent.click(screen.getByRole('button', { name: /^enviar resposta$/i }));

    // While the AI is thinking (isSubmitting), the answered question immediately disappears
    expect(screen.queryByRole('button', { name: /^enviar resposta$/i })).toBeNull();
    expect(screen.queryByTestId('probe-card')).toBeNull();
    expect(screen.getByText('Descarta o pacote')).toBeDefined();
    // The answer key is known here: the result shows without waiting for the judge
    expect(screen.getByText('Certa')).toBeDefined();
    expect(screen.queryByText(/você (acertou|errou)/i)).toBeNull();
    expect(screen.queryByTestId('collapsed-question-pill')).toBeNull();

    resolveProbe({
      attempt: {
        questionId: 'q-dock',
        nodeId: 'osi-l3-ttl',
        verdict: 'mastered',
        judgeReasoning: 'Correto.',
      },
      nextAction: 'transition_plan',
      session: {
        ...probingSession,
        phase: 'plan_review',
        plan: 'Plano gerado.',
        questionCount: 8,
        frontierClarity: 100,
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /começar as aulas/i })).toBeDefined();
    });
  });
  it('ends the teaching pass with a summary card (instead of looping) when no concept is left to teach', async () => {
    (window as any).api.startSocraticStep = vi.fn().mockResolvedValue(null);
    const teachingSession: ProbingSession = {
      id: 'sess-teach',
      mode: 'teaching',
      disciplineId: 'osi-layer3',
      phase: 'teaching',
      goal: 'Camada 3 e TTL',
      questionCount: 8,
      frontierClarity: 100,
      attempts: [],
      nodesState: { 'osi-l3-ttl': 'frontier', 'osi-l3-ip': 'mastered' },
    };

    render(<SessionView initialNodes={initialNodes} currentSession={teachingSession} />);

    await waitFor(() => {
      expect(screen.getByTestId('teaching-finished')).toBeDefined();
    });
    expect(screen.getByText(/aulas concluídas/i)).toBeDefined();
    expect(screen.getByText(/1 conceito ainda não está firme/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /abrir mapa de conceitos/i })).toBeDefined();
    // No new socratic step was opened
    expect(screen.queryByTestId('probe-card')).toBeNull();
  });
});
