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

function compose(files: string[]): string {
  return files
    .map((f) => loadPromptFile(f))
    .filter(Boolean)
    .join('\n\n---\n\n');
}

// Each agent receives only what it uses: every extra document is paid for on every call.
const VOICE = 'shared/10-voice.md';
const ACCURACY = 'shared/15-accuracy.md';
const MENTAL_MODEL = 'shared/16-mental-model.md';
const QUESTIONS = 'shared/20-question-tools.md';
const CONFIDENCE = 'shared/25-confidence.md';
const FORMATTING = 'shared/40-formatting.md';
const PROBE = 'prober/10-probe-doctrine.md';
const METHOD = 'teacher/05-method.md';
const PLANNING = 'teacher/10-planning.md';
const TEACHING = 'teacher/20-teaching.md';
const PREDICTIONS = 'teacher/28-predictions.md';
const QUESTION_PRINCIPLES = 'teacher/30-question-principles.md';

export const getOrientationInstructions = (): string => compose([VOICE, ACCURACY]);

export const getGraphInstructions = (): string =>
  compose(['system-prompt.md', ACCURACY, QUESTIONS, FORMATTING, PROBE, METHOD]);

export const getProberInstructions = (): string =>
  compose([VOICE, ACCURACY, MENTAL_MODEL, QUESTIONS, CONFIDENCE, FORMATTING, PROBE]);

export const getPredictInstructions = (): string => compose([VOICE, ACCURACY, FORMATTING, PREDICTIONS]);

export const getPlanInstructions = (): string => compose([VOICE, ACCURACY, FORMATTING, METHOD, PLANNING]);

export const getNotesInstructions = (): string => compose([VOICE, ACCURACY, FORMATTING]);

export const getTeachInstructions = (): string =>
  compose([VOICE, ACCURACY, FORMATTING, TEACHING, QUESTION_PRINCIPLES]);
