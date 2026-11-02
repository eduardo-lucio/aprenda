import { ConceptNode, QuestionData } from '../../shared/types';
import {
  buildGoalOptionsPrompt,
  buildGraphPrompt,
  buildPredictPrompt,
  buildProbeQuestionPrompt,
} from '../prompts/curriculumPrompts';
import { callLLM, LLMCaller, parseLLMJson } from './llmClient';

function slugify(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'conceito'
  );
}

/**
 * Validates and repairs an AI-generated concept graph so it is a proper DAG:
 * unique ids, only known prerequisites, no cycles, levels consistent with depth (1..4).
 */
export function sanitizeGraph(rawNodes: any[]): ConceptNode[] {
  if (!Array.isArray(rawNodes)) return [];

  const idMap = new Map<string, string>();
  const used = new Set<string>();
  const drafts: Array<{ id: string; raw: any }> = [];

  for (const raw of rawNodes) {
    if (!raw || typeof raw.title !== 'string' || !raw.title.trim()) continue;
    let id = slugify(String(raw.id || raw.title));
    let suffix = 2;
    const base = id;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    if (raw.id) idMap.set(String(raw.id), id);
    idMap.set(slugify(String(raw.id || raw.title)), id);
    drafts.push({ id, raw });
  }

  const prereqMap = new Map<string, string[]>();
  for (const { id, raw } of drafts) {
    const list: string[] = Array.isArray(raw.prerequisites) ? raw.prerequisites : [];
    const resolved = list
      .map((p) => idMap.get(String(p)) || idMap.get(slugify(String(p))))
      .filter((p): p is string => Boolean(p) && p !== id);
    prereqMap.set(id, Array.from(new Set(resolved)));
  }

  // Remove cycles via DFS (drop back-edges)
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (id: string) => {
    state.set(id, 1);
    const prereqs = prereqMap.get(id) || [];
    const kept: string[] = [];
    for (const p of prereqs) {
      const s = state.get(p) || 0;
      if (s === 1) continue;
      if (s === 0) visit(p);
      kept.push(p);
    }
    prereqMap.set(id, kept);
    state.set(id, 2);
  };
  for (const { id } of drafts) if (!state.get(id)) visit(id);

  // Depth-based levels (clamped to 1..4), respecting AI hints when consistent
  const depth = new Map<string, number>();
  const getDepth = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    const prereqs = prereqMap.get(id) || [];
    const d = prereqs.length === 0 ? 1 : 1 + Math.max(...prereqs.map(getDepth));
    depth.set(id, d);
    return d;
  };

  return drafts.map(({ id, raw }) => {
    const hinted = Number(raw.level);
    const minLevel = Math.min(4, getDepth(id));
    const level = Math.min(4, Math.max(minLevel, Number.isFinite(hinted) ? Math.round(hinted) : minLevel));
    return {
      id,
      title: String(raw.title).trim(),
      summary: String(raw.summary || '').trim(),
      level,
      prerequisites: prereqMap.get(id) || [],
      unconditionalTruth: String(raw.unconditionalTruth || raw.summary || '').trim(),
      status: 'untested' as const,
    };
  });
}

export function buildDeterministicQuestion(node: ConceptNode, goal: string): QuestionData {
  return {
    id: `q-${node.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    nodeId: node.id,
    questionText: `No estudo de "${goal}", em relação a "${node.title}", qual alternativa expressa o princípio correto?`,
    options: [
      node.unconditionalTruth,
      `O conceito de "${node.title}" opera de forma isolada, sem depender de premissas ou condições de contorno.`,
      `"${node.title}" aplica-se por pura convenção empírica arbitrária, sem relações de causalidade no sistema.`,
      `Nenhuma validação conceitual ou verificação é necessária para aplicar "${node.title}".`,
    ],
    correctOptionIndex: 0,
    anchorConcept: node.title,
    difficulty: node.level || 2,
  };
}

export function buildFallbackGraphForGoal(goal: string): {
  discipline: string;
  nodes: ConceptNode[];
  questions: Record<string, QuestionData>;
  firstQuestion: QuestionData;
} {
  const topic = goal.trim() || 'Tema de Estudo';
  const prefix = slugify(topic).slice(0, 20) || 'topico';
  const nodes: ConceptNode[] = [
    {
      id: `${prefix}-l1-definicoes`,
      title: `Definições Essenciais de ${topic}`,
      summary: `Vocabulário fundamental e premissas de base de ${topic}.`,
      level: 1,
      prerequisites: [],
      unconditionalTruth: `O domínio de ${topic} requer clareza inequívoca em suas definições primitivas.`,
      status: 'untested',
    },
    {
      id: `${prefix}-l1-premissas`,
      title: `Premissas e Condições de Validade`,
      summary: `Condições de contorno nas quais ${topic} opera.`,
      level: 1,
      prerequisites: [],
      unconditionalTruth: `Regras teóricas só se sustentam dentro de suas premissas explícitas.`,
      status: 'untested',
    },
    {
      id: `${prefix}-l2-estrutura`,
      title: `Estrutura e Relações Causais`,
      summary: `Mecanismo de funcionamento interno de ${topic}.`,
      level: 2,
      prerequisites: [`${prefix}-l1-definicoes`],
      unconditionalTruth: `Relações causais previsíveis ligam as entradas às saídas em ${topic}.`,
      status: 'untested',
    },
    {
      id: `${prefix}-l2-modelagem`,
      title: `Modelagem e Representação Formal`,
      summary: `Expressão analítica e representação formal de ${topic}.`,
      level: 2,
      prerequisites: [`${prefix}-l1-premissas`],
      unconditionalTruth: `A modelagem precisa elimina intuições vagas e inconsistências.`,
      status: 'untested',
    },
    {
      id: `${prefix}-l3-aplicacao`,
      title: `Aplicação Prática em ${topic}`,
      summary: `Resolução de casos práticos e resolução de problemas.`,
      level: 3,
      prerequisites: [`${prefix}-l2-estrutura`],
      unconditionalTruth: `A aplicação correta preserva os invariantes do sistema sob variação de parâmetros.`,
      status: 'untested',
    },
    {
      id: `${prefix}-l3-casos-limite`,
      title: `Casos Limite e Análise Crítica`,
      summary: `Comportamento sob condições extremas e armadilhas comuns.`,
      level: 3,
      prerequisites: [`${prefix}-l2-modelagem`],
      unconditionalTruth: `Casos extremos desmascaram premissas falsas e atalhos heurísticos errôneos.`,
      status: 'untested',
    },
    {
      id: `${prefix}-l4-sintese`,
      title: `Síntese e Domínio Integrado de ${topic}`,
      summary: `Tomada de decisão avançada e articulação de múltiplos conceitos.`,
      level: 4,
      prerequisites: [`${prefix}-l3-aplicacao`, `${prefix}-l3-casos-limite`],
      unconditionalTruth: `O domínio pleno unifica fundamentos, mecanismos e limites em síntese coerente.`,
      status: 'untested',
    },
    {
      id: `${prefix}-l4-avaliacao`,
      title: `Avaliação Crítica e Resolução Inovadora`,
      summary: `Julgamento e generalização conceitual sob incerteza em ${topic}.`,
      level: 4,
      prerequisites: [`${prefix}-l4-sintese`],
      unconditionalTruth: `A maestria se manifesta na capacidade de diagnosticar falhas sutis e formular soluções robustas.`,
      status: 'untested',
    },
  ];

  const questions: Record<string, QuestionData> = {};
  for (const n of nodes) {
    questions[n.id] = buildDeterministicQuestion(n, topic);
  }

  const firstQuestion = questions[`${prefix}-l4-sintese`] || questions[nodes[nodes.length - 1].id];

  return { discipline: topic, nodes, questions, firstQuestion };
}

export interface GeneratedGraphResult {
  discipline: string;
  nodes: ConceptNode[];
  questions?: Record<string, QuestionData>;
  firstQuestion?: QuestionData;
}

export class CurriculumGenerator {
  constructor(private llm: LLMCaller = callLLM) {}

  defaultGoalOptions(goal: string): string[] {
    const clean = goal.trim();
    return [
      `Domínio completo de: ${clean}`,
      `Fundamentos e pré-requisitos essenciais de: ${clean}`,
      `Aplicações práticas e resolução de problemas em: ${clean}`,
    ];
  }

  async generateGoalOptions(goal: string): Promise<string[]> {
    try {
      const { systemPrompt, prompt } = buildGoalOptionsPrompt(goal);
      const raw = await this.llm({
        systemPrompt,
        prompt,
        temperature: 0.3,
        jsonMode: true,
        maxTokens: 250,
        timeoutMs: 15000,
      });
      const parsed = parseLLMJson<{ options?: unknown }>(raw);
      const options = Array.isArray(parsed.options)
        ? parsed.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0).slice(0, 3)
        : [];
      if (options.length > 0) return options;
    } catch {
      // Fallback directly derived from the user's input
    }
    return this.defaultGoalOptions(goal);
  }

  async generateGraph(goal: string): Promise<GeneratedGraphResult> {
    try {
      const { systemPrompt, prompt } = buildGraphPrompt(goal);
      const raw = await this.llm({
        systemPrompt,
        prompt,
        temperature: 0.2,
        jsonMode: true,
        maxTokens: 1600,
        timeoutMs: 40000,
      });
      const parsed = parseLLMJson<any>(raw);
      const rawNodes = Array.isArray(parsed) ? parsed : parsed?.nodes;
      const nodes = sanitizeGraph(rawNodes);

      if (nodes.length >= 3) {
        const questions: Record<string, QuestionData> = {};

        // 1. Extract any questions attached to individual nodes
        if (Array.isArray(rawNodes)) {
          for (const raw of rawNodes) {
            const rawId = typeof raw?.id === 'string' ? slugify(raw.id) : '';
            const matchingNode = nodes.find((n) => n.id === rawId);
            const q = raw?.question;
            if (
              matchingNode &&
              q &&
              q.questionText &&
              Array.isArray(q.options) &&
              q.options.length === 4 &&
              Number(q.correctOptionIndex) >= 0 &&
              Number(q.correctOptionIndex) < 4
            ) {
              questions[matchingNode.id] = {
                id: `q-${matchingNode.id}-${Date.now()}`,
                nodeId: matchingNode.id,
                questionText: String(q.questionText),
                options: q.options.map((o: unknown) => String(o)),
                correctOptionIndex: Number(q.correctOptionIndex),
                anchorConcept: matchingNode.title,
                difficulty: matchingNode.level,
              };
            }
          }
        }

        // 2. Also check if a standalone firstQuestion was provided
        const rawQ = parsed?.firstQuestion;
        if (
          rawQ &&
          rawQ.questionText &&
          Array.isArray(rawQ.options) &&
          rawQ.options.length === 4 &&
          Number(rawQ.correctOptionIndex) >= 0 &&
          Number(rawQ.correctOptionIndex) < 4
        ) {
          const targetNode =
            nodes.find((n) => n.id === rawQ.nodeId) ||
            [...nodes].sort((a, b) => b.level - a.level)[0];
          questions[targetNode.id] = {
            id: `q-${targetNode.id}-${Date.now()}`,
            nodeId: targetNode.id,
            questionText: String(rawQ.questionText),
            options: rawQ.options.map((o: unknown) => String(o)),
            correctOptionIndex: Number(rawQ.correctOptionIndex),
            anchorConcept: String(rawQ.anchorConcept || targetNode.title),
            difficulty: Number(rawQ.difficulty) || targetNode.level,
          };
        }

        // 3. Ensure EVERY single node in the DAG has an immediate question ready in memory
        for (const node of nodes) {
          if (!questions[node.id]) {
            questions[node.id] = buildDeterministicQuestion(node, goal);
          }
        }

        const highestNode = [...nodes].sort((a, b) => b.level - a.level)[0];
        const firstQuestion = questions[highestNode.id] || questions[nodes[0].id];

        return {
          discipline:
            typeof parsed?.discipline === 'string' && parsed.discipline.trim()
              ? parsed.discipline.trim()
              : goal,
          nodes,
          questions,
          firstQuestion,
        };
      }
    } catch {
      // Fallback
    }
    return buildFallbackGraphForGoal(goal);
  }

  async generateQuestion(
    node: ConceptNode,
    goal: string,
    previousQuestions: string[]
  ): Promise<QuestionData> {
    const { systemPrompt, prompt } = buildProbeQuestionPrompt(node, goal, previousQuestions);

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await this.llm({
          systemPrompt,
          prompt,
          temperature: 0.4,
          jsonMode: true,
          maxTokens: 450,
          timeoutMs: 25000,
        });
        const parsed = parseLLMJson<any>(raw);
        const options: string[] = Array.isArray(parsed.options)
          ? parsed.options.map((o: unknown) => String(o)).filter((o: string) => o.trim())
          : [];
        const correct = Number(parsed.correctOptionIndex);
        if (parsed.questionText && options.length === 4 && correct >= 0 && correct < 4) {
          return {
            id: `q-${node.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            nodeId: node.id,
            questionText: String(parsed.questionText),
            options,
            correctOptionIndex: correct,
            anchorConcept: String(parsed.anchorConcept || node.title),
            difficulty: Number(parsed.difficulty) || node.level,
          };
        }
      } catch {
        // Retry once or fall through to high-quality fallback
      }
    }

    return {
      id: `q-${node.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      nodeId: node.id,
      questionText: `Sobre "${node.title}" no contexto de ${goal}, qual alternativa expressa o princípio correto?`,
      options: [
        node.unconditionalTruth,
        `O conceito de ${node.title} independe de quaisquer pré-requisitos ou condições de contorno.`,
        `${node.title} aplica-se apenas de modo arbitrário, sem relação causal com o restante do sistema.`,
        `Nenhuma verificação conceitual é necessária para aplicar ${node.title}.`,
      ],
      correctOptionIndex: 0,
      anchorConcept: node.title,
      difficulty: node.level || 2,
    };
  }

  async generatePredict(node: ConceptNode, goal: string): Promise<{ questionText: string; promptGoal: string }> {
    try {
      const { systemPrompt, prompt } = buildPredictPrompt(node, goal);
      const raw = await this.llm({
        systemPrompt,
        prompt,
        temperature: 0.5,
        jsonMode: true,
        maxTokens: 300,
        timeoutMs: 20000,
      });
      const parsed = parseLLMJson<any>(raw);
      if (parsed.questionText) {
        return {
          questionText: String(parsed.questionText),
          promptGoal: String(parsed.promptGoal || 'Preveja o resultado antes de vermos a teoria formal.'),
        };
      }
    } catch {
      // Fallback
    }
    return {
      questionText: `Antes de estudarmos formalmente "${node.title}": ${node.summary} Com base na sua intuição, o que você espera que aconteça e por quê?`,
      promptGoal: 'Preveja o resultado antes de vermos a teoria formal.',
    };
  }
}
