import type { ElectronAPI, ProbingSession, ConceptNode, PersistedUi } from '../../shared/types';

/**
 * Dev-only stand-in for the Electron preload API, so the renderer can be opened in a plain browser
 * (`npm run dev` → http://localhost:5173/?mock) for visual checks. Never bundled in production:
 * it is imported dynamically behind `import.meta.env.DEV`.
 */
const mkNode = (id: string, title: string, level: number, prerequisites: string[], status: ConceptNode['status'] = 'untested'): ConceptNode => ({
  id,
  title,
  summary: `Resumo de ${title}.`,
  level,
  prerequisites,
  unconditionalTruth: `Verdade incondicional de ${title}.`,
  status,
});
const nodes: ConceptNode[] = [
  mkNode('valores-tipos', 'Valores e Tipos', 1, [], 'mastered'),
  mkNode('variaveis', 'Variáveis e Escopo', 1, [], 'mastered'),
  mkNode('operadores', 'Operadores e Coerção de Tipos', 1, [], 'false_positive'),
  mkNode('funcoes', 'Funções e Argumentos', 2, ['variaveis', 'valores-tipos'], 'frontier'),
  mkNode('controle', 'Controle de Fluxo', 2, ['operadores'], 'untested'),
  mkNode('objetos', 'Objetos e Referências', 2, ['valores-tipos'], 'blind_spot'),
  mkNode('closures', 'Closures, escopo léxico e o contexto de execução', 3, ['funcoes', 'variaveis'], 'untested'),
  mkNode('arrays', 'Arrays e Iteração', 3, ['objetos', 'controle'], 'untested'),
  mkNode('prototipos', 'Protótipos e Herança', 3, ['objetos'], 'untested'),
  mkNode('assincrono', 'Assincronismo: Promises e async/await', 4, ['closures', 'funcoes'], 'untested'),
  mkNode('eventloop', 'Event Loop', 4, ['assincrono'], 'untested'),
  mkNode('modulos', 'Módulos e Organização de Código', 4, ['closures', 'arrays'], 'untested'),
];

const question = {
  id: 'q-mock-1',
  nodeId: 'valores-tipos',
  questionText:
    "Você está depurando uma função de validação que usa `typeof` para ramificar lógica. O trecho abaixo imprime o tipo de cada valor passado:\n\n```javascript\nfunction inspecionar(valor) {\n  console.log(typeof valor);\n}\n\ninspecionar(42);\ninspecionar('texto');\ninspecionar(true);\ninspecionar(undefined);\ninspecionar(null);\ninspecionar(() => {});\ninspecionar({});\ninspecionar(Symbol('id'));\n```\n\nQual sequência **exata** de strings o console exibirá, na ordem?",
  options: [
    '`number`, `string`, `boolean`, `undefined`, `null`, `function`, `object`, `symbol`',
    '`number`, `string`, `boolean`, `undefined`, `object`, `function`, `object`, `symbol`',
    '`number`, `string`, `boolean`, `undefined`, `object`, `object`, `function`, `symbol`',
    '`number`, `string`, `boolean`, `undefined`, `null`, `object`, `function`, `symbol`',
  ],
  correctOptionIndex: 1,
  anchorConcept: 'Valores e Tipos',
  agentThinking: 'Primeira questão ataca o nó raiz com um cenário de debugging.',
};

const long = 'Decompondo o objetivo em um DAG de 8 nós. O chão incondicional (Nível 1) é valores-e-tipos: todo valor em JS tem exatamente um tipo. Nível 2 adiciona variáveis e a distinção primitivo vs referência. Nível 3 introduz funções e controle de fluxo. Nível 4 sintetiza objetos, arrays e protótipos. A primeira questão ataca o nó raiz com um cenário prático de debugging usando typeof. ';

const session: ProbingSession = {
  id: 'mock-session',
  mode: 'teaching',
  disciplineId: 'JavaScript',
  goal: 'Fundamentos da linguagem (variáveis, tipos, funções, controle de fluxo)',
  phase: 'probing',
  questionCount: 1,
  frontierClarity: 0,
  attempts: [],
  socraticSteps: [],
  nodesState: { 'valores-tipos': 'untested', variaveis: 'untested' },
  currentQuestion: question,
  goalClarificationQuestion: 'O que exatamente você quer aprender sobre JavaScript?',
  goalClarificationOptions: ['Fundamentos da linguagem', 'DOM e APIs do browser', 'JavaScript assíncrono', 'Outro / não sei ainda — quero orientação'],
  agentThinking: long.repeat(2),
  goalThinking: long.repeat(2),
  tokensUsed: 17488,
};

const ui: PersistedUi = {
  chatMessages: [{ id: 'm0', role: 'user', text: 'quero aprender javascript', afterAttemptCount: -1, timestamp: 1 }],
  answeredScope: {
    questionText: 'O que exatamente você quer aprender sobre JavaScript? Escolha a opção que melhor descreve seu objetivo:',
    options: session.goalClarificationOptions!,
    selectedOption: 'Fundamentos da linguagem',
    thinkingText: '',
  },
};

export function installMockApi(): void {
  if ((window as any).api) return;
  const api: Partial<ElectronAPI> = {
    listSessions: async () => [{ id: session.id, title: session.goal, mode: 'teaching', updatedAt: Date.now() }],
    loadSession: async () => ({ session: structuredClone(session), ui }),
    getSession: async () => null,
    getGraphState: async () => nodes,
    deleteSession: async () => {},
    saveSessionUi: async () => {},
    updateSettings: async () => ({ success: true }),
    windowAction: () => {},
    onThinkingStream: () => () => {},
    onTokensUpdate: () => () => {},
    submitProbeAnswer: async () => { throw new Error('mock: sem backend'); },
  };
  (window as any).api = api;
}
