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

    expect(screen.getByText(/nova sessão/i)).toBeDefined();
    expect(screen.getByText(/o professor vai abrir uma investigação sobre o que você já sabe/i)).toBeDefined();

    const input = screen.getByPlaceholderText(/ex: digite o tema ou disciplina/i);
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
    const input = screen.getByPlaceholderText(/ex: digite o tema ou disciplina/i);
    fireEvent.change(input, { target: { value: 'Camada 3 e TTL' } });
    fireEvent.click(screen.getByRole('button', { name: /iniciar diagnóstico/i }));

    await waitFor(() => {
      expect(screen.getByText('Aprofundar em TTL e Prevenção de Loops')).toBeDefined();
    });

    // Select clarification option and submit
    fireEvent.click(screen.getByText('Aprofundar em TTL e Prevenção de Loops'));
    fireEvent.click(screen.getByRole('button', { name: /^enviar$/i }));

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
          judgeReasoning: 'Raciocínio causal perfeito sobre roteamento inter-redes.',
        },
      ],
      socraticSteps: [],
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
    expect(screen.getByText('CORRECT')).toBeDefined();
    expect(screen.getByText('A camada 3 roteia pacotes entre sub-redes distintas.')).toBeDefined();

    // Active question is rendered below it
    expect(
      screen.getByText('Como o IP determina se um host de destino está na mesma rede local?')
    ).toBeDefined();

    // Multiple AGENT'S THINKING blocks exist between turns
    const thinkingToggles = screen.getAllByText(/agent's thinking/i);
    expect(thinkingToggles.length).toBeGreaterThanOrEqual(2);

    // Bottom chat input bar is rendered
    expect(
      screen.getByPlaceholderText(/digite seu pensamento ou sua própria resposta/i)
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
    const searchInput = screen.getByPlaceholderText('Search models...');
    expect(searchInput).toBeDefined();

    // Model items matching Image 3 are displayed
    expect(screen.getByText('Z.ai: GLM 5.3 FlashX Legal')).toBeDefined();
    expect(screen.getByText('$0.37/$1.25')).toBeDefined();
    expect(screen.getByText(/openrouter · ~z-ai\/glm-5.3-flashx-legal · 104k/)).toBeDefined();

    expect(screen.getByText('Particle AI: Particle-1')).toBeDefined();
    expect(screen.getByText('$0.05/$0.50')).toBeDefined();

    // Configure models button at bottom is present
    const configureBtn = screen.getByText(/configurar modelos\.\.\./i);
    expect(configureBtn).toBeDefined();
    fireEvent.click(configureBtn);
    expect(onOpenSettingsMock).toHaveBeenCalled();

    // Reopen and search
    fireEvent.click(modelPillBtn);
    const searchInput2 = screen.getByPlaceholderText('Search models...');
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
    socraticSteps: [],
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

  it('docks the probe question with confidence slider and uses the chat field as the only reasoning input', async () => {
    render(<SessionView initialNodes={initialNodes} currentSession={probingSession} />);

    // Single text field + confidence slider above it; no separate "Your thinking" field
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.queryByText(/your thinking/i)).toBeNull();
    expect(screen.getByText('CONFIDENCE')).toBeDefined();
    expect(screen.getByText('Não sei / Ainda não domino este conceito')).toBeDefined();

    // Nothing chosen yet: send is disabled and placeholder invites own answer / thinking
    const send = screen.getByRole('button', { name: /^enviar$/i }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(screen.getByPlaceholderText(/digite seu pensamento ou sua própria resposta/i)).toBeDefined();

    // Choosing an option enables send even with empty (optional) reasoning
    fireEvent.click(screen.getByText('Descarta o pacote'));
    expect(send.disabled).toBe(false);
    expect(screen.getByPlaceholderText(/explique seu raciocínio \(opcional\)/i)).toBeDefined();

    fireEvent.change(screen.getByRole('slider'), { target: { value: '80' } });
    fireEvent.click(send);

    await waitFor(() => {
      expect((window as any).api.submitProbeAnswer).toHaveBeenCalledWith({
        selectedOptionIndex: 0,
        confidence: 80,
        thinkingText: '(O aluno não explicou o raciocínio.)',
      });
    });
  });

  it('sends the typed chat text as the reasoning of the selected alternative', async () => {
    render(<SessionView initialNodes={initialNodes} currentSession={probingSession} />);
    fireEvent.click(screen.getByText('Retransmite'));
    fireEvent.change(screen.getByPlaceholderText(/explique seu raciocínio/i), {
      target: { value: 'Porque o roteador reenvia sempre.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^enviar$/i }));

    await waitFor(() => {
      expect((window as any).api.submitProbeAnswer).toHaveBeenCalledWith({
        selectedOptionIndex: 1,
        confidence: 50,
        thinkingText: 'Porque o roteador reenvia sempre.',
      });
    });
  });

  it('treats text typed without choosing an alternative as the student\'s own answer', async () => {
    render(<SessionView initialNodes={initialNodes} currentSession={probingSession} />);
    fireEvent.change(screen.getByPlaceholderText(/digite seu pensamento ou sua própria resposta/i), {
      target: { value: 'O pacote some e o roteador avisa a origem.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^enviar$/i }));

    await waitFor(() => {
      expect((window as any).api.submitProbeAnswer).toHaveBeenCalledWith({
        selectedOptionIndex: -1,
        confidence: 50,
        thinkingText: '[Resposta própria] O pacote some e o roteador avisa a origem.',
      });
    });
  });

  it('docks the scope question and asks for a custom scope in the chat field (no confidence slider)', async () => {
    render(<SessionView initialNodes={initialNodes} />);
    fireEvent.change(screen.getByPlaceholderText(/ex: digite o tema ou disciplina/i), {
      target: { value: 'Camada 3 e TTL' },
    });
    fireEvent.click(screen.getByRole('button', { name: /iniciar diagnóstico/i }));

    await waitFor(() => {
      expect(screen.getByText('Tabela de Roteamento')).toBeDefined();
    });
    expect(screen.queryByText('CONFIDENCE')).toBeNull();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);

    // Free-text custom scope typed in the chat field
    const input = screen.getByPlaceholderText(/insira um escopo personalizado/i);
    fireEvent.change(input, { target: { value: 'Só o ICMP' } });
    fireEvent.click(screen.getByRole('button', { name: /^enviar$/i }));

    await waitFor(() => {
      expect((window as any).api.submitGoalClarification).toHaveBeenCalledWith('Só o ICMP', '');
    });
  });

  it('collapses the docked question into a compact pill on scroll up and re-expands when clicking the pill', () => {
    render(<SessionView initialNodes={initialNodes} currentSession={probingSession} />);

    const feed = screen.getByTestId('chat-feed-scroll');
    const activeDock = screen.getByTestId('active-question-dock');

    // Question lives inside the chat feed with zero internal scroll
    expect(feed.contains(activeDock)).toBe(true);
    expect(activeDock.querySelector('.overflow-y-auto')).toBeNull();
    expect(activeDock.getAttribute('aria-hidden')).toBe('false');
    expect(activeDock.className).toContain('grid-rows-[1fr]');

    // Initially expanded: full question options and chat input are visible
    expect(screen.getByText('Descarta o pacote')).toBeDefined();
    expect(screen.getByPlaceholderText(/digite seu pensamento ou sua própria resposta/i)).toBeDefined();
    expect(screen.queryByTestId('collapsed-question-pill')).toBeNull();

    // Simulate a tall scrollable feed where user scrolled up from bottom
    Object.defineProperty(feed, 'scrollHeight', { value: 1200, configurable: true });
    Object.defineProperty(feed, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(feed, 'scrollTop', { value: 780, configurable: true, writable: true });
    fireEvent.scroll(feed);

    // User scrolls up significantly
    feed.scrollTop = 300;
    fireEvent.scroll(feed);

    // Full question card smoothly animates to 0fr (collapsed), compact pill replaces input field
    expect(activeDock.getAttribute('aria-hidden')).toBe('true');
    expect(activeDock.className).toContain('grid-rows-[0fr]');
    const pill = screen.getByTestId('collapsed-question-pill');
    expect(pill).toBeDefined();
    expect(pill.textContent).toContain('O que acontece quando o TTL chega a 0?');
    expect(pill.textContent).toContain('Answer');

    // Chat input field is NOT visible while the question is collapsed
    expect(screen.queryByPlaceholderText(/digite seu pensamento ou sua própria resposta/i)).toBeNull();

    // Clicking the collapsed question pill scrolls to bottom and re-expands the question and its input
    fireEvent.click(pill);

    expect(screen.queryByTestId('collapsed-question-pill')).toBeNull();
    expect(activeDock.getAttribute('aria-hidden')).toBe('false');
    expect(activeDock.className).toContain('grid-rows-[1fr]');
    expect(screen.getByText('Descarta o pacote')).toBeDefined();
    expect(screen.getByPlaceholderText(/digite seu pensamento ou sua própria resposta/i)).toBeDefined();
  });

  it('shrinks on wheel-up even at scrollTop=0, hides chat input while collapsed, and hides the question immediately when answered', async () => {
    let resolveProbe!: (val: any) => void;
    (window as any).api.submitProbeAnswer = vi.fn().mockImplementation(
      () => new Promise((r) => { resolveProbe = r; })
    );

    render(<SessionView initialNodes={initialNodes} currentSession={probingSession} />);

    const feed = screen.getByTestId('chat-feed-scroll');
    // Only 1 AGENT'S THINKING block for the single active probe turn
    expect(screen.getAllByText(/agent's thinking/i)).toHaveLength(1);

    // Even when scrollTop is 0 (like Turn 0), wheeling up shrinks the question; question bar replaces chat input
    fireEvent.wheel(feed, { deltaY: -80 });
    expect(screen.getByTestId('collapsed-question-pill')).toBeDefined();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);

    // Click the collapsed question bar to re-open the question, choose an option and submit
    fireEvent.click(screen.getByTestId('collapsed-question-pill'));
    expect(screen.queryByTestId('collapsed-question-pill')).toBeNull();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);

    fireEvent.click(screen.getByText('Descarta o pacote'));
    fireEvent.click(screen.getByRole('button', { name: /^enviar$/i }));

    // While the AI is thinking (isSubmitting), the answered question immediately disappears from the bottom dock
    expect(screen.queryByText('Descarta o pacote')).toBeNull();
    expect(screen.queryByTestId('collapsed-question-pill')).toBeNull();

    resolveProbe({
      attempt: {
        questionId: 'q-dock',
        nodeId: 'osi-l3-ttl',
        verdict: 'mastered',
        judgeReasoning: 'Correto.',
      },
      nextAction: 'transition_diagnosis',
      session: {
        ...probingSession,
        phase: 'frontier_diagnosis',
        questionCount: 8,
        frontierClarity: 100,
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/diagnóstico da fronteira cognitiva concluído/i)).toBeDefined();
    });
  });
});
