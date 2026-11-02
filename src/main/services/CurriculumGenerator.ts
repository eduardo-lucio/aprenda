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

/**
 * Builds a domain-agnostic 10-node DAG from the user's goal string when the LLM
 * is unreachable/offline so the session never hangs.
 */
export function buildFallbackGraphForGoal(goal: string): { discipline: string; nodes: ConceptNode[] } {
  const topic = goal.trim() || 'Tema de Estudo';
  const prefix = slugify(topic).slice(0, 20) || 'topico';
  const nodes: ConceptNode[] = [
    {
      id: `${prefix}-l1-definicoes`,
      title: `Definições Elementares de ${topic}`,
      summary: `Vocabulário essencial e grandezas básicas de ${topic}.`,
      level: 1,
      prerequisites: [],
      unconditionalTruth: `Compreender ${topic} exige domínio inequívoco de seus termos e definições de base.`,
      status: 'untested',
    },
    {
      id: `${prefix}-l1-premissas`,
      title: `Premissas e Condições de Contorno`,
      summary: `Hipóteses fundamentais em que ${topic} opera.`,
      level: 1,
      prerequisites: [],
      unconditionalTruth: `Toda regra de ${topic} só é válida dentro de suas condições de contorno explícitas.`,
      status: 'untested',
    },
    {
      id: `${prefix}-l2-estrutura`,
      title: `Estrutura Interna e Componentes`,
      summary: `Como as partes de ${topic} se organizam e interagem.`,
      level: 2,
      prerequisites: [`${prefix}-l1-definicoes`, `${prefix}-l1-premissas`],
      unconditionalTruth: `A estrutura de ${topic} conecta diretamente as definições de base ao mecanismo causal.`,
      status: 'untested',
    },
    {
      id: `${prefix}-l2-mecanismo`,
      title: `Mecanismo Causal Principal`,
      summary: `Relações de causa e efeito em ${topic}.`,
      level: 2,
      prerequisites: [`${prefix}-l1-definicoes`],
      unconditionalTruth: `O mecanismo central determina de forma previsível a transição entre estados em ${topic}.`,
      status: 'untested',
    },
    {
      id: `${prefix}-l2-representacao`,
      title: `Modelagem e Representação Formal`,
      summary: `Representação formal e simbólica aplicada a ${topic}.`,
      level: 2,
      prerequisites: [`${prefix}-l1-premissas`],
      unconditionalTruth: `A representação formal elimina ambiguidades na análise de ${topic}.`,
      status: 'untested',
    },
    {
      id: `${prefix}-l3-aplicacao`,
      title: `Aplicação Direta de ${topic}`,
      summary: `Resolução de casos concretos utilizando ${topic}.`,
      level: 3,
      prerequisites: [`${prefix}-l2-estrutura`, `${prefix}-l2-mecanismo`],
      unconditionalTruth: `A aplicação correta de ${topic} preserva invariantes mesmo quando os parâmetros mudam.`,
      status: 'untested',
    },
    {
      id: `${prefix}-l3-casos-limite`,
      title: `Casos Limite e Exceções`,
      summary: `Comportamento de ${topic} sob condições extremas.`,
      level: 3,
      prerequisites: [`${prefix}-l2-mecanismo`, `${prefix}-l2-representacao`],
      unconditionalTruth: `Casos limite expõem falhas de intuição superficial e exigem verificação dos pré-requisitos.`,
      status: 'untested',
    },
    {
      id: `${prefix}-l3-diagnostico`,
      title: `Diagnóstico de Erros Comuns`,
      summary: `Identificação de falsos positivos e confusões conceituais em ${topic}.`,
      level: 3,
      prerequisites: [`${prefix}-l2-estrutura`],
      unconditionalTruth: `Distinguir correlação aparente de causa real evita conclusões falsas em ${topic}.`,
      status: 'untested',
    },
    {
      id: `${prefix}-l4-integracao`,
      title: `Integração Sistêmica em ${topic}`,
      summary: `Combinação de múltiplos subconceitos de ${topic} em cenários reais.`,
      level: 4,
      prerequisites: [`${prefix}-l3-aplicacao`, `${prefix}-l3-casos-limite`],
      unconditionalTruth: `O domínio completo de ${topic} integra fundamentos, mecanismos e casos limite de forma coerente.`,
      status: 'untested',
    },
    {
      id: `${prefix}-l4-avaliacao`,
      title: `Análise Crítica e Otimização`,
      summary: `Tomada de decisão avançada e trade-offs em ${topic}.`,
      level: 4,
      prerequisites: [`${prefix}-l3-aplicacao`, `${prefix}-l3-diagnostico`],
      unconditionalTruth: `Toda escolha avançada em ${topic} envolve avaliar compromissos sob restrições reais.`,
      status: 'untested',
    },
  ];

  return { discipline: topic, nodes };
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
      const raw = await this.llm({ systemPrompt, prompt, temperature: 0.5, jsonMode: true, timeoutMs: 30000 });
      const parsed = parseLLMJson<{ options?: unknown }>(raw);
      const options = Array.isArray(parsed.options)
        ? parsed.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0).slice(0, 3)
        : [];
      if (options.length > 0) return options;
    } catch {
      // fall through to neutral options derived only from the student's own goal
    }
    return this.defaultGoalOptions(goal);
  }

  async generateGraph(goal: string): Promise<{ discipline: string; nodes: ConceptNode[] }> {
    try {
      const { systemPrompt, prompt } = buildGraphPrompt(goal);
      const raw = await this.llm({ systemPrompt, prompt, temperature: 0.3, jsonMode: true, timeoutMs: 90000 });
      const parsed = parseLLMJson<any>(raw);
      const rawNodes = Array.isArray(parsed) ? parsed : parsed?.nodes;
      const nodes = sanitizeGraph(rawNodes);
      if (nodes.length >= 3) {
        return {
          discipline: typeof parsed?.discipline === 'string' && parsed.discipline.trim() ? parsed.discipline.trim() : goal,
          nodes,
        };
      }
    } catch {
      // Offline / unconfigured fallback derived from the student's goal
    }
    return buildFallbackGraphForGoal(goal);
  }

  async generateQuestion(node: ConceptNode, goal: string, previousQuestions: string[]): Promise<QuestionData> {
    const { systemPrompt, prompt } = buildProbeQuestionPrompt(node, goal, previousQuestions);

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await this.llm({ systemPrompt, prompt, temperature: 0.6, jsonMode: true, timeoutMs: 60000 });
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
        // retry or fall back
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
      const raw = await this.llm({ systemPrompt, prompt, temperature: 0.6, jsonMode: true, timeoutMs: 45000 });
      const parsed = parseLLMJson<any>(raw);
      if (parsed.questionText) {
        return {
          questionText: String(parsed.questionText),
          promptGoal: String(parsed.promptGoal || 'Preveja o resultado antes de vermos a teoria formal.'),
        };
      }
    } catch {
      // generic fallback below
    }
    return {
      questionText: `Antes de estudarmos formalmente "${node.title}": ${node.summary} Com base na sua intuição, o que você espera que aconteça e por quê?`,
      promptGoal: 'Preveja o resultado antes de vermos a teoria formal.',
    };
  }
}
