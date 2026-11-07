import fs from 'fs';
import path from 'path';

/**
 * Loads markdown prompt files from `prompts/` directory, mirroring the learnharness structure.
 * Falls back to embedded strings if files are not accessible on disk.
 */

const promptCache = new Map<string, string>();

function findPromptsRoot(): string {
  // Installed app: electron-builder copies prompts/ into the resources folder (extraResources)
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [
    ...(resourcesPath ? [path.join(resourcesPath, 'prompts')] : []),
    path.join(process.cwd(), 'prompts'),
    path.join(__dirname, '../../../prompts'),
    path.join(__dirname, '../../prompts'),
    path.join(__dirname, '../prompts'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      return dir;
    }
  }
  console.warn('[promptLoader] Pasta prompts/ não encontrada; os agentes vão rodar sem a doutrina pedagógica.');
  return path.join(process.cwd(), 'prompts');
}

export function loadPromptFile(relativePath: string, fallbackText = ''): string {
  if (promptCache.has(relativePath)) {
    return promptCache.get(relativePath)!;
  }

  const root = findPromptsRoot();
  const fullPath = path.join(root, relativePath);

  try {
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8').trim();
      promptCache.set(relativePath, content);
      return content;
    }
  } catch (err) {
    console.warn(`[promptLoader] Could not read prompt file: ${fullPath}`, err);
  }

  return fallbackText.trim();
}

/** Clears cached prompts so file edits take effect immediately. */
export function reloadPrompts(): void {
  promptCache.clear();
}

/** Composes the shared base instructions for all agents (voice, accuracy, mental model, LaTeX/questions). */
export function getSharedBaseInstructions(): string {
  const systemPrompt = loadPromptFile('system-prompt.md');
  const voice = loadPromptFile('shared/10-voice.md');
  const accuracy = loadPromptFile('shared/15-accuracy.md');
  const mentalModel = loadPromptFile('shared/16-mental-model.md');
  const questionTools = loadPromptFile('shared/20-question-tools.md');
  const confidence = loadPromptFile('shared/25-confidence.md');
  const formatting = loadPromptFile('shared/40-formatting.md');

  return [systemPrompt, voice, accuracy, mentalModel, questionTools, confidence, formatting]
    .filter(Boolean)
    .join('\n\n---\n\n');
}

/** Composes the Prober agent doctrine (diagnostic edge-finding, bracketing). */
export function getProberInstructions(): string {
  const shared = getSharedBaseInstructions();
  const proberDoctrine = loadPromptFile('prober/10-probe-doctrine.md');

  return [shared, proberDoctrine].filter(Boolean).join('\n\n---\n\n');
}

/** Composes the Teacher agent doctrine (unconditional truths, motivated discovery, predict/check). */
export function getTeacherInstructions(): string {
  const shared = getSharedBaseInstructions();
  const method = loadPromptFile('teacher/05-method.md');
  const planning = loadPromptFile('teacher/10-planning.md');
  const teaching = loadPromptFile('teacher/20-teaching.md');
  const predictions = loadPromptFile('teacher/28-predictions.md');
  const questionPrinciples = loadPromptFile('teacher/30-question-principles.md');

  return [shared, method, planning, teaching, predictions, questionPrinciples]
    .filter(Boolean)
    .join('\n\n---\n\n');
}
