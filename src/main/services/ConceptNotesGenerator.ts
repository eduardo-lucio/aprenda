import { CompletedLesson, ConceptNode, ConceptNoteContent, ProbeAttempt } from '../../shared/types';
import { buildConceptNotesPrompt } from '../prompts/curriculumPrompts';
import { callLLM, isFatalLLMError, LLMCaller, localize, parseLLMJson } from './llmClient';

export interface ConceptEvidence {
  node: ConceptNode;
  attempts: ProbeAttempt[];
  lessons: CompletedLesson[];
}

const MAX_TOPICS = 8;

function cleanTopics(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const topics = value
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim())
    .filter(Boolean);
  return Array.from(new Set(topics)).slice(0, MAX_TOPICS);
}

/** A concept mastered by inference has no attempt of its own, but the diagnosis did vouch for it. */
function hasLearningEvidence({ node, attempts, lessons }: ConceptEvidence): boolean {
  return node.status === 'mastered' || attempts.length > 0 || lessons.length > 0;
}

/** Keeps only well-formed notes of the requested concepts. */
export function sanitizeConceptNotes(raw: unknown, evidence: ConceptEvidence[]): ConceptNoteContent[] {
  const list = Array.isArray(raw) ? raw : (raw as { notes?: unknown } | null)?.notes;
  if (!Array.isArray(list)) return [];

  const byId = new Map(evidence.map((e) => [e.node.id, e]));
  const notes = new Map<string, ConceptNoteContent>();
  for (const item of list) {
    const nodeId = String(item?.nodeId ?? '');
    const source = byId.get(nodeId);
    const summary = typeof item?.summary === 'string' ? item.summary.trim() : '';
    if (!source || !summary || notes.has(nodeId)) continue;
    notes.set(nodeId, {
      nodeId,
      summary,
      toLearn: cleanTopics(item.toLearn),
      // The model must not credit the student with something nothing in the session supports
      learned: hasLearningEvidence(source) ? cleanTopics(item.learned) : [],
    });
  }
  return Array.from(notes.values());
}

export class ConceptNotesGenerator {
  constructor(private llm: LLMCaller = callLLM) {}

  async generate(goal: string, evidence: ConceptEvidence[]): Promise<ConceptNoteContent[]> {
    if (evidence.length === 0) return [];
    const { systemPrompt, prompt } = buildConceptNotesPrompt(goal, evidence);
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await this.llm({
          systemPrompt,
          prompt,
          temperature: 0.3,
          jsonMode: true,
          maxTokens: 4096,
          effortLevel: 'low',
          timeoutMs: 90000,
          // Written while the student may be doing something else: never shows up as the tutor thinking
          isBackground: true,
        });
        const notes = sanitizeConceptNotes(parseLLMJson<unknown>(raw), evidence);
        if (notes.length > 0) return notes;
        lastErr = new Error(localize('a IA não devolveu anotações válidas', 'the AI returned no valid notes'));
      } catch (err) {
        console.error(`[ConceptNotesGenerator] Falha ao gerar anotações (tentativa ${attempt + 1}):`, err);
        if (isFatalLLMError(err)) throw err;
        lastErr = err;
      }
    }
    throw new Error(
      localize(
        `Não foi possível escrever as anotações: ${String((lastErr as Error)?.message || lastErr)}`,
        `The notes could not be written: ${String((lastErr as Error)?.message || lastErr)}`
      )
    );
  }
}
