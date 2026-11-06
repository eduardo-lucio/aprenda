import { ConceptNode, QuestionData } from '../../shared/types';
import {
  buildGoalOptionsPrompt,
  buildGraphPrompt,
  buildPredictPrompt,
  buildProbeQuestionPrompt,
} from '../prompts/curriculumPrompts';
import { callLLM, extractLLMThinking, LLMCaller, parseLLMJson } from './llmClient';

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

export interface GeneratedGraphResult {
  discipline: string;
  nodes: ConceptNode[];
  firstQuestion?: QuestionData;
  agentThinking?: string;
}

export interface GoalClarificationResult {
  question: string;
  options: string[];
  agentThinking?: string;
}

export class CurriculumGenerator {
  private lastGoalThinking?: string;

  constructor(private llm: LLMCaller = callLLM) {}

  getLastGoalThinking(): string | undefined {
    return this.lastGoalThinking;
  }

  private isFatalProviderError(err: any): boolean {
    const msg = String(err?.message || err || '');
    return /HTTP (401|402|403|429)\b/i.test(msg);
  }

  async generateGoalOptions(goal: string): Promise<GoalClarificationResult> {
    const { systemPrompt, prompt } = buildGoalOptionsPrompt(goal);
    let lastErr: unknown;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const raw = await this.llm({
          systemPrompt,
          prompt,
          temperature: 0.4,
          jsonMode: true,
          effortLevel: 'low',
          timeoutMs: 60000,
        });
        const nativeThink = extractLLMThinking(raw);
        const parsed = parseLLMJson<{ options?: unknown; question?: unknown; agentThinking?: unknown }>(raw);
        const jsonThink =
          typeof parsed.agentThinking === 'string' && parsed.agentThinking.trim()
            ? parsed.agentThinking.trim()
            : undefined;
        this.lastGoalThinking = jsonThink || nativeThink;

        const rawOpts = Array.isArray(parsed.options)
          ? parsed.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0).slice(0, 9)
          : [];
        const question =
          typeof parsed.question === 'string' && parsed.question.trim() ? parsed.question.trim() : '';

        if (rawOpts.length >= 5 && question) {
          let options = rawOpts;
          if (!options.some((o) => /outro|não sei/i.test(o))) {
            options = [...options.slice(0, 8), 'Outro / não sei ainda — quero orientação'];
          }
          return { question, options, agentThinking: this.lastGoalThinking };
        }
        lastErr = new Error('A IA não retornou opções de escopo válidas.');
      } catch (err) {
        console.error(`[CurriculumGenerator] Falha ao gerar opções de escopo via IA (tentativa ${attempt + 1}):`, err);
        lastErr = err;
        if (this.isFatalProviderError(err)) throw err;
      }
    }
    throw new Error(
      `Não foi possível gerar as opções de escopo com a IA: ${String((lastErr as any)?.message || lastErr)}`
    );
  }

  async generateGraph(goal: string): Promise<GeneratedGraphResult> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
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
      const nativeThink = extractLLMThinking(raw);
      const parsed = parseLLMJson<any>(raw);
      const rawNodes = Array.isArray(parsed) ? parsed : parsed?.nodes;
      const nodes = sanitizeGraph(rawNodes);
      const graphThinking =
        (typeof parsed?.agentThinking === 'string' && parsed.agentThinking.trim()) ||
        nativeThink;

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
          const sortedAsc = [...nodes].sort((a, b) => a.level - b.level);
          const candidateNode = nodes.find((n) => n.id === rawQ.nodeId);
          // Ensure the first question targets a foundational (lowest level) node
          const targetNode =
            candidateNode && candidateNode.level <= sortedAsc[0].level
              ? candidateNode
              : sortedAsc[0];
          const qThink =
            (typeof rawQ.agentThinking === 'string' && rawQ.agentThinking.trim()) ||
            graphThinking;
          firstQuestion = {
            id: `q-${targetNode.id}-${Date.now()}`,
            nodeId: targetNode.id,
            questionText: String(rawQ.questionText),
            options: rawQ.options.map((o: unknown) => String(o)),
            correctOptionIndex: Number(rawQ.correctOptionIndex),
            anchorConcept: String(rawQ.anchorConcept || targetNode.title),
            difficulty: Number(rawQ.difficulty) || targetNode.level,
            agentThinking: qThink,
          };
        }

        return {
          discipline:
            typeof parsed?.discipline === 'string' && parsed.discipline.trim()
              ? parsed.discipline.trim()
              : goal,
          nodes,
          firstQuestion,
          agentThinking: graphThinking,
        };
      }
      lastErr = new Error('A IA retornou um grafo conceitual inválido.');
    } catch (err) {
      console.error('[CurriculumGenerator] Falha ao gerar grafo DAG via IA:', err);
      lastErr = err;
      if (this.isFatalProviderError(err)) {
        throw err;
      }
    }
    }
    throw new Error(
      `Não foi possível gerar o grafo de conceitos com a IA: ${String((lastErr as any)?.message || lastErr)}`
    );
  }

  async generateQuestion(
    node: ConceptNode,
    goal: string,
    previousQuestions: string[],
    callOpts?: { signal?: AbortSignal; isBackground?: boolean }
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
          isBackground: Boolean(callOpts?.signal || callOpts?.isBackground),
        });
        const nativeThink = extractLLMThinking(raw);
        const parsed = parseLLMJson<any>(raw);
        const options: string[] = Array.isArray(parsed.options)
          ? parsed.options.map((o: unknown) => String(o)).filter((o: string) => o.trim())
          : [];
        const correct = Number(parsed.correctOptionIndex);
        if (parsed.questionText && options.length === 4 && correct >= 0 && correct < 4) {
          const qThink =
            (typeof parsed.agentThinking === 'string' && parsed.agentThinking.trim()) ||
            nativeThink;
          return {
            id: `q-${node.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            nodeId: node.id,
            questionText: String(parsed.questionText),
            options,
            correctOptionIndex: correct,
            anchorConcept: String(parsed.anchorConcept || node.title),
            difficulty: Number(parsed.difficulty) || node.level,
            agentThinking: qThink,
          };
        }
      } catch (err) {
        console.error(`[CurriculumGenerator] Falha ao gerar questão via IA (tentativa ${attempt + 1}):`, err);
        if (this.isFatalProviderError(err)) {
          throw err;
        }
      }
    }

    throw new Error(`Não foi possível gerar a questão com a IA para "${node.title}".`);
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
        isBackground: Boolean(callOpts?.signal),
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
