# Documento de Design: EduCognitive Agent Harness (MVP)

**Data**: 31/10/2026  
**Status**: Aprovado para Planejamento  
**Tópico**: Harness de Aprendizagem Cognitiva Desktop com FSM Local, Diagnóstico de Falsos Positivos e Ensino Socrático Adaptativo para Feira Acadêmica

---

## 1. Visão Geral e Intenção (O "Porquê")

O **EduCognitive Agent Harness** é um aplicativo desktop multiplataforma para Linux e Windows (desenvolvido em **Electron + React/Vite + TypeScript**) projetado para transformar a maneira como estudantes universitários absorvem e retêm conteúdos complexos de disciplinas de computação e engenharia (com foco de demonstração em **Redes de Computadores: Camada 3 - Modelo OSI**).

Diferente de sistemas convencionais estilo "NotebookLM" ou chats passivos que apenas resumem documentos ou corrigem simulados de forma binária (certo/errado), o EduCognitive atua como um **harness de diagnóstico cognitivo profundo**. Inspirado no *LearnHarness*, o sistema combate ativamente a "ilusão de competência":
- Prioriza a autoexplicação do aluno (*"Thinking out loud"* via voz ou texto) antes de qualquer alternativa de múltipla escolha.
- Identifica **Falsos Positivos** (quando o aluno acerta a alternativa por eliminação ou coincidência, mas expressa um raciocínio conceitualmente errôneo).
- Mapeia visualmente a **fronteira de conhecimento** em um Grafo de Dependências Dirigido (DAG) em tempo real.
- Executa um ciclo socrático cirúrgico (*Predict $\rightarrow$ Teach $\rightarrow$ Check*) baseado em dois princípios pedagógicos fundamentais:
  1. **Princípio I (Verdades Incondicionais Primeiro):** Fixar as bases e definições sólidas sem ressalvas na raiz antes de construir novos conceitos.
  2. **Princípio II ("Como eu poderia ter descoberto isso?"):** Passos de raciocínio motivados (estilo 3Blue1Brown), fazendo com que cada novo fato pareça autoevidente.

---

## 2. Metas, Não-Metas e Anti-Metas

### Metas (Goals)
1. **Interface Fiel ao LearnHarness**:
   - Janela frameless dark mode (`#0a0a0a` / `#111111`) com controles de janela personalizados (minimizar, maximizar, fechar).
   - Barra lateral retrátil com histórico de sessões, botões `+ TEACHING` e `+ PRACTICE`, abas de filtro e rodapé com atalhos de configurações.
   - Área central de chat socrático com blocos recolhíveis de raciocínio da IA (*"Agent's Thinking"*).
   - Card de questão unificado contendo: pergunta com alternativas de múltipla escolha ou opção "Outro / Escreva a sua", campo *"Your Thinking"* (com suporte a microfone/Web Speech API e digitação) e Slider de Confiança (0% a 100%).
   - Barra inferior persistente com botão de voz (*Dictate*), seletor de modelo (`gemini-2.0-flash`, `gpt-4o-mini`, etc.), nível de raciocínio (*Thinking: High/Low*) e contador de tokens contextuais.
2. **Definição Guiada de Objetivo (Goal Orientation)**:
   - Coleta em 1 turno interativo da intenção específica do aluno (ex: *"Quero aprender a Camada 3 do Modelo OSI para uma prova"*).
   - A IA apresenta opções de escopo concreto para afunilamento e faz a regressão imediata na árvore de dependências para identificar os nós basilares (bits, enlace, quadros, endereçamento IP).
3. **Fase 1 - Sondagem Adaptativa com Bracketing (Piso de 8 Questões)**:
   - Aplicação de questões investigativas calibradas por busca em largura inicial e afunilamento (*Zoom-In*).
   - **Regra de Término**: 8 questões é o piso estrito (mínimo obrigatório). A sondagem continua além de 8 questões até que a taxa de nitidez da fronteira atinja 100% (todos os nós da trilha ativa classificados) ou até que o usuário decida avançar manualmente para o diagnóstico.
   - O Juiz Cognitivo avalia primeiro o raciocínio livre do aluno antes de verificar a alternativa marcada.
4. **Fase 2 - Mapeamento Visual da Fronteira (DAG)**:
   - Renderização gráfica do Grafo de Conhecimento com código de cores pedagógico:
     - 🟢 **Verde (Domínio Sólido)**: Acerto sustentado por raciocínio correto e confiança consistente.
     - 🟡 **Amarelo (Falso Positivo)**: Acerto da alternativa, porém com fundamentação incorreta ou viciada.
     - 🔴 **Vermelho (Ponto Cego)**: Erro cometido com alta confiança (equívoco mental arraigado).
     - 🔵 **Azul (Fronteira Limpa)**: O limite exato onde o conhecimento comprovado do estudante termina.
5. **Fase 3 - Loop de Ensino Socrático (Predict $\rightarrow$ Teach $\rightarrow$ Check)**:
   - Ensino cirúrgico de exatamente **1 degrau por vez**, focando nos nós amarelos (falsos positivos) e azuis (fronteira).
   - **Predict**: Pergunta indutiva formulada antes da explicação para motivar a descoberta pelo aluno.
   - **Teach**: Explanação concisa do degrau fundamentada nas verdades incondicionais.
   - **Check**: Questão de verificação recolhida atrás do botão *"Check your understanding"*, revelada após a leitura.
   - **Tratamento de Falhas no Check**: Se o aluno errar, o sistema gera uma explicação corretiva focada na falha de raciocínio e avança, evitando loops infinitos na apresentação.
6. **Conexão Local Flexível e Offline-First**:
   - Backend local no Electron Main conectando-se a qualquer endpoint compatível com a API OpenAI (OpenAI, Gemini via proxy/endpoint OpenAI, Ollama local, Omniroute ou 9router).
   - Matéria de demonstração (Redes de Computadores) totalmente pré-estruturada em arquivos locais Markdown/JSON para execução rápida e determinística na feira acadêmica.

### Não-Metas (Non-Goals para o MVP)
- Sincronização em nuvem ou contas multi-usuário (o app roda 100% local no desktop do estudante).
- Transcrição de áudio por modelos neurais locais pesados (Whisper offline) — o MVP utiliza a Web Speech API nativa do Chromium do Electron para transcrição imediata sem carga de GPU/CPU.
- Criação e parsing dinâmico de centenas de PDFs pesados durante os 5 minutos da apresentação ao vivo da feira (a disciplina virá com grafos e textos de ancoragem prontos e validados).

### Anti-Metas (Anti-Goals)
- **Não ser um chatbot genérico passivo**: O sistema não é um assistente aberto para conversas aleatórias; o fluxo é estritamente conduzido pelo harness de diagnóstico e ensino.
- **Não ignorar o raciocínio em favor da alternativa**: Uma resposta correta com justificativa confusa NUNCA deve ser pontuada como domínio. O foco absoluto é desarmar falsos positivos.
- **Não inundar o estudante com paredes de texto**: Cada degrau socrático deve ser curto, motivado e seguido de verificação.

---

## 3. Abordagens Consideradas e Decisão Arquitetural

### Abordagens Avaliadas

1. **Abordagem 1 (Escolhida): Máquina de Estados Finita (FSM) no Main Process com Agentes Especializados**
   - *Como funciona*: O fluxo pedagógico (Meta $\rightarrow$ Sondagem 8+ $\rightarrow$ Diagnóstico DAG $\rightarrow$ Loop Socrático) é controlado por uma FSM determinística escrita em TypeScript no Node.js (Main Process). O LLM é acionado com papéis isolados e tipados via schemas JSON:
     - `CognitiveJudge`: Avalia `thinking` + `confidence` + `selectedOption` e emite veredito do nó.
     - `SurgicalGenerator`: Gera a questão seguinte ou o degrau (*Predict/Teach/Check*) ancorado na fonte.
   - *Trade-offs*: Exige codificar a máquina de estados e o gerenciamento de sessões no código local, mas garante que o fluxo nunca falhe, alucine de fase ou pule etapas na apresentação da feira.

2. **Abordagem 2 (Descartada): Agente Autônomo com Loop ReAct e Function Calling**
   - *Motivo do descarte*: Deixar o LLM orquestrar o tempo de perguntar e transicionar de fase via tool-calling gera alto risco de alucinação de formato, loop infinito e inconsistência na contagem de questões durante uma apresentação ao vivo na feira acadêmica.

3. **Abordagem 3 (Descartada): Grafo Estático Heurístico sem IA Generativa nas Questões**
   - *Motivo do descarte*: Questões totalmente fixas reduzem a capacidade do sistema de se adaptar ao que o aluno acabou de expressar em seu raciocínio livre.

---

## 4. Arquitetura do Sistema e Modelo de Dados

### 4.1 Separação de Processos no Electron
- **Main Process (Node.js + TypeScript)**:
  - `StateManager / FSM`: Orquestra as fases da sessão, contagem de questões (mínimo de 8) e estados dos nós do DAG.
  - `LLMClient`: Comunicação HTTP padronizada (OpenAI-compatible) com retry e tratamento de erro de rede.
  - `KnowledgeStore`: Leitura dos nós pré-estruturados da matéria (Redes de Computadores / Camada 3) e persistência local das sessões em JSON em `userData`.
  - `IPC Handlers`: Canais seguros tipados (`session:start`, `session:submit-answer`, `graph:get`, etc.) via `preload.ts` (`contextBridge`).
- **Renderer Process (React + Vite + Tailwind CSS + TypeScript)**:
  - UI Dark minimalista inspirada no LearnHarness.
  - Reconhecimento de fala via Web Speech API integrado ao campo *"Your thinking"*.
  - Renderização do Grafo de Conhecimento (DAG) interativo com nós coloridos por status cognitivo.
  - Renderização de Markdown e fórmulas matemáticas (KaTeX / LaTeX) para termos técnicos de redes.

### 4.2 Entidades Principais
```typescript
interface ConceptNode {
  id: string;               // ex: "osi-l3-ttl"
  title: string;            // ex: "Time To Live (TTL) e Prevenção de Loops"
  summary: string;          // Resumo técnico de ancoragem
  level: number;            // 1 (fundamentos/bits) a 4 (roteamento avançado/CIDR)
  prerequisites: string[];  // IDs dos nós necessários antes deste
  unconditionalTruth: string; // Verdade incondicional / Princípio I
  status: 'untested' | 'mastered' | 'false_positive' | 'blind_spot' | 'frontier';
}

interface ProbeAttempt {
  questionId: string;
  nodeId: string;
  questionText: string;
  options: string[];
  correctOptionIndex: number;
  selectedOptionIndex: number;
  confidence: number;       // 0 a 100
  thinkingText: string;     // Transcrição de fala ou digitação
  verdict: 'mastered' | 'false_positive' | 'blind_spot' | 'frontier';
  judgeReasoning: string;   // Diagnóstico do Juiz Cognitivo sobre a mente do aluno
}

interface SocraticStep {
  nodeId: string;
  predictQuestion: string;
  predictStudentAnswer?: string;
  teachContent: string;     // Explanação concisa de 1 degrau
  checkQuestion: {
    questionText: string;
    options: string[];
    correctOptionIndex: number;
    explanation: string;
  };
  checkStudentAnswer?: number;
  isCheckPassed?: boolean;
}

interface ProbingSession {
  id: string;
  mode: 'teaching' | 'practice'; // + TEACHING (completo) vs + PRACTICE (fixação rápida)
  disciplineId: string;
  goal: string;
  phase: 'goal_orientation' | 'probing' | 'frontier_diagnosis' | 'socratic_teach' | 'completed';
  questionCount: number;    // Piso de 8 questões na fase de sondagem
  frontierClarity: number;  // 0% a 100% de nitidez da fronteira
  attempts: ProbeAttempt[];
  socraticSteps: SocraticStep[];
  nodesState: Record<string, ConceptNode['status']>;
}
```

---

## 5. Especificação dos Prompts e Papéis dos Agentes

### 5.1 O Juiz Cognitivo (`CognitiveJudge`)
- **Regra Primária**: Ler primeiro o `thinkingText` do estudante. A alternativa correta é secundária no primeiro julgamento.
- **Matriz de Diagnóstico**:
  - *Alternativa Correta + Raciocínio Sólido + Alta Confiança*: $\rightarrow$ `mastered` (🟢 Verde).
  - *Alternativa Correta + Raciocínio Viciado/Incorreto/Chute*: $\rightarrow$ `false_positive` (🟡 Amarelo).
  - *Alternativa Incorreta + Alta Confiança*: $\rightarrow$ `blind_spot` (🔴 Vermelho).
  - *Alternativa Incorreta + Baixa Confiança/Dúvida Honesta*: $\rightarrow$ `frontier` (🔵 Azul).

### 5.2 O Gerador Cirúrgico (`SurgicalGenerator`)
- Gera questões que simulam situações práticas e reais da camada de rede (ex: captura de tráfego no Wireshark, descarte de pacotes em roteadores, cálculos de máscara).
- Formula distratores homogêneos e plausíveis baseados nas confusões conceituais reais documentadas para cada nó.
- No modo socrático, formula a pergunta de previsão (*Predict*), a explicação enxuta de 1 degrau (*Teach*) e a verificação (*Check*).

---

## 6. O que Fica sob Responsabilidade do Construtor (Builder's Scope)
- Nomes exatos dos eventos e canais IPC no `preload.ts`.
- Detalhes de estilização fina em CSS/Tailwind (paleta `#0a0a0a`, `#1e293b`, fontes serifadas no título da sessão conforme screenshots).
- Implementação específica da renderização dos nós do grafo (visualização customizada React/SVG/Canvas).
- Mapeamento detalhado dos 10 a 14 nós pré-indexados para a matéria "Redes de Computadores / Camada 3".
