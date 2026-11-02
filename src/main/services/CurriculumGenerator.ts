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

export function buildContextualFallbackQuestion(node: ConceptNode, goal: string): QuestionData {
  const correctOptionIndex = Math.floor(Math.random() * 4);
  const distractors = [
    `Assumir que ${node.title} prescinde da validação de pré-requisitos sob variação de parâmetros.`,
    `Considerar que as propriedades de ${node.title} decorrem de escolhas arbitrárias sem base conceitual.`,
    `Supor que ${node.title} atua independentemente dos invariantes estruturais estabelecidos para ${goal}.`,
  ];
  let dIdx = 0;
  const options: string[] = [];
  for (let i = 0; i < 4; i++) {
    if (i === correctOptionIndex) {
      options.push(node.unconditionalTruth);
    } else {
      options.push(distractors[dIdx++]);
    }
  }

  return {
    id: `q-${node.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    nodeId: node.id,
    questionText: `Considerando o papel de "${node.title}" (${node.summary.toLowerCase()}) em ${goal}, como este conceito governa a dinâmica do sistema?`,
    options,
    correctOptionIndex,
    anchorConcept: node.title,
    difficulty: node.level || 2,
  };
}

export function buildFallbackGraphForGoal(goal: string): {
  discipline: string;
  nodes: ConceptNode[];
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

  const firstQuestion: QuestionData = {
    id: `q-${prefix}-l4-1`,
    nodeId: `${prefix}-l4-sintese`,
    questionText: `No estudo avançado de "${topic}", qual é o critério determinante para validar a solução de um problema complexo?`,
    options: [
      `Garantir que os princípios fundamentais e condições de contorno sejam respeitados de ponta a ponta.`,
      `Ignorar restrições de contorno se a resposta parecer plausível na superfície.`,
      `Considerar apenas a intuição inicial sem testar casos extremos.`,
      `Aplicar fórmulas prontas sem verificar a aplicabilidade ao contexto.`,
    ],
    correctOptionIndex: 0,
    anchorConcept: `${topic}: Síntese Avançada`,
    difficulty: 4,
  };

  return { discipline: topic, nodes, firstQuestion };
}

export interface GeneratedGraphResult {
  discipline: string;
  nodes: ConceptNode[];
  firstQuestion?: QuestionData;
}

export class CurriculumGenerator {
  constructor(private llm: LLMCaller = callLLM) {}

  defaultGoalOptions(goal: string): string[] {
    const clean = goal.trim() || 'Conceito';
    return [
      `Mecanismos internos e dinâmicas causais de ${clean}`,
      `Condições de contorno, restrições e casos limites em ${clean}`,
      `Modelagem analítica e diagnóstico de falhas em ${clean}`,
    ];
  }

  private isFatalProviderError(err: any): boolean {
    const msg = String(err?.message || err || '');
    return /HTTP (401|402|403|429)\b/i.test(msg);
  }

  async generateGoalOptions(goal: string): Promise<string[]> {
    try {
      const { systemPrompt, prompt } = buildGoalOptionsPrompt(goal);
      const raw = await this.llm({
        systemPrompt,
        prompt,
        temperature: 0.3,
        jsonMode: true,
        maxTokens: 2048,
        effortLevel: 'low',
        timeoutMs: 25000,
      });
      const parsed = parseLLMJson<{ options?: unknown }>(raw);
      const options = Array.isArray(parsed.options)
        ? parsed.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0).slice(0, 3)
        : [];
      if (options.length > 0) return options;
    } catch (err) {
      console.error('[CurriculumGenerator] Falha ao gerar opções de escopo via IA:', err);
      if (this.isFatalProviderError(err)) {
        throw err;
      }
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
        maxTokens: 4096,
        effortLevel: 'low',
        timeoutMs: 45000,
      });
      const parsed = parseLLMJson<any>(raw);
      const rawNodes = Array.isArray(parsed) ? parsed : parsed?.nodes;
      const nodes = sanitizeGraph(rawNodes);

      if (nodes.length >= 3) {
        let firstQuestion: QuestionData | undefined;
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
          firstQuestion = {
            id: `q-${targetNode.id}-${Date.now()}`,
            nodeId: targetNode.id,
            questionText: String(rawQ.questionText),
            options: rawQ.options.map((o: unknown) => String(o)),
            correctOptionIndex: Number(rawQ.correctOptionIndex),
            anchorConcept: String(rawQ.anchorConcept || targetNode.title),
            difficulty: Number(rawQ.difficulty) || targetNode.level,
          };
        }

        return {
          discipline:
            typeof parsed?.discipline === 'string' && parsed.discipline.trim()
              ? parsed.discipline.trim()
              : goal,
          nodes,
          firstQuestion,
        };
      }
    } catch (err) {
      console.error('[CurriculumGenerator] Falha ao gerar grafo DAG via IA:', err);
      if (this.isFatalProviderError(err)) {
        throw err;
      }
    }
    return buildFallbackGraphForGoal(goal);
  }

  async generateQuestion(
    node: ConceptNode,
    goal: string,
    previousQuestions: string[],
    callOpts?: { signal?: AbortSignal }
  ): Promise<QuestionData> {
    const { systemPrompt, prompt } = buildProbeQuestionPrompt(node, goal, previousQuestions);

    for (let attempt = 0; attempt < 2; attempt++) {
      if (callOpts?.signal?.aborted) {
        throw new Error('Operação cancelada pelo orquestrador.');
      }
      try {
        const raw = await this.llm({
          systemPrompt,
          prompt,
          temperature: 0.4,
          jsonMode: true,
          maxTokens: 2048,
          effortLevel: 'low',
          timeoutMs: 30000,
          signal: callOpts?.signal,
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
      } catch (err) {
        console.error(`[CurriculumGenerator] Falha ao gerar questão via IA (tentativa ${attempt + 1}):`, err);
        if (this.isFatalProviderError(err)) {
          throw err;
        }
      }
    }

    return buildContextualFallbackQuestion(node, goal);
  }

  async generatePredict(
    node: ConceptNode,
    goal: string,
    callOpts?: { signal?: AbortSignal }
  ): Promise<{ questionText: string; promptGoal: string }> {
    try {
      if (callOpts?.signal?.aborted) {
        throw new Error('Operação cancelada pelo orquestrador.');
      }
      const { systemPrompt, prompt } = buildPredictPrompt(node, goal);
      const raw = await this.llm({
        systemPrompt,
        prompt,
        temperature: 0.5,
        jsonMode: true,
        maxTokens: 300,
        timeoutMs: 20000,
        signal: callOpts?.signal,
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
