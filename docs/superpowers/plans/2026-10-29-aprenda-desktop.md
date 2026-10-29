# Aprenda Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete cross-platform (Linux & Windows) Electron + TypeScript desktop application inspired by Google NotebookLM that helps students master course materials through active recall, exam-style objective questions, and offline spaced repetition.

**Architecture:** Electron application with React 18, Vite, and Tailwind CSS in the Renderer process, communicating through a secure `contextBridge` (`preload.ts`) to Node.js services in the Main process. The Main process handles native PDF extraction, local SQLite/structured persistence in `userData`, an SM-2 spaced repetition queue, and an OpenAI-compatible client connecting to external routers (Omniroute, 9router) or local Ollama.

**Tech Stack:** Electron, TypeScript, React 18, Vite, Tailwind CSS, Lucide React, pdf-parse, better-sqlite3 / sql.js, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-29-aprenda-desktop-design.md`

## Global Constraints

- Platform support: Linux and Windows desktop environments.
- Stack: TypeScript throughout (Electron Main, Preload, and React Renderer).
- UI Architecture: 3-column layout (Sidebar navigation / Central content / Right active study).
- Question format: strictly multiple-choice (A, B, C, D) with balanced length, plausible distractors, and justifications for all alternatives.
- Spaced Repetition: 100% offline using saved questions previously missed, scheduled via SM-2.
- AI Integration: OpenAI-compatible endpoint with configurable `baseURL`, `apiKey`, and `model`.

## Review Focus

1. **Unparseable or scanned PDF without text**: Return clear user-facing error `"PDF sem camada de texto selecionável ou ilegível"` instead of crashing.
2. **AI Provider HTTP failure or invalid API key**: Catch 401/429/timeout errors and display an actionable toast/banner directing the user to Settings without losing current input.
3. **Malformed JSON response from AI**: Validate output schema with fallback parser so the exam runner never receives `undefined` options.
4. **Zero pending cards in Spaced Repetition**: Display friendly empty state `"Você está em dia com todas as revisões de hoje nesta disciplina!"` when count is 0.
5. **Context Window Overrun on large PDFs**: Enforce chunking limits (~4k tokens per study slice) before passing prompt context to models.

---

### Task 1: Project Scaffolding & Tooling

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `tailwind.config.js`
- Create: `postcss.config.js`
- Create: `vitest.config.ts`
- Create: `index.html`

**Interfaces:**
- Produces: Project build scripts (`npm run build`, `npm run dev`, `npm test`), TypeScript paths, and bundle configuration for Electron Main, Preload, and Renderer.

- [ ] **Step 1: Write configuration files and `package.json`**
Configure dependencies: `electron`, `vite`, `react`, `react-dom`, `@types/react`, `@types/react-dom`, `typescript`, `tailwindcss`, `postcss`, `autoprefixer`, `lucide-react`, `vitest`, `pdf-parse`, `clsx`, `tailwind-merge`.

- [ ] **Step 2: Run test runner to verify configuration**
Run: `npm test`
Expected: 0 tests found or test runner initialized without syntax errors.

- [ ] **Step 3: Verify build tooling**
Run: `npx tsc --noEmit`
Expected: PASS (0 type errors).

- [ ] **Step 4: Commit**
```bash
git add package.json tsconfig*.json vite.config.ts tailwind.config.js postcss.config.js vitest.config.ts index.html
git commit -m "chore: scaffold electron vite react typescript project"
```

---

### Task 2: Core Domain Types & SM-2 Spaced Repetition Engine

**Files:**
- Create: `src/types/index.ts`
- Create: `src/services/srs.ts`
- Test: `tests/srs.test.ts`

**Interfaces:**
- Produces:
  - Types: `Discipline`, `Document`, `Question`, `QuestionOption`, `StudyMode`, `SimuladoSession`, `UserPerformance`, `AISettings`.
  - Function: `calculateNextReview(current: UserPerformance, score: 0 | 1): UserPerformance`
  - Function: `isDueForReview(item: UserPerformance, now?: Date): boolean`

- [ ] **Step 1: Write the failing tests for SM-2 Spaced Repetition**
```typescript
// tests/srs.test.ts
import { describe, it, expect } from 'vitest';
import { calculateNextReview, isDueForReview } from '../src/services/srs';
import { UserPerformance } from '../src/types';

describe('SM-2 Algorithm', () => {
  it('resets interval and streak on incorrect answer (score 0)', () => {
    const prev: UserPerformance = {
      questionId: 'q1',
      lastReviewedAt: '2026-10-28T00:00:00Z',
      nextReviewAt: '2026-10-29T00:00:00Z',
      intervalDays: 6,
      repetitionCount: 3,
      consecutiveCorrect: 2,
      easeFactor: 2.5,
      lastScore: 1
    };
    const next = calculateNextReview(prev, 0);
    expect(next.intervalDays).toBe(1);
    expect(next.consecutiveCorrect).toBe(0);
    expect(next.lastScore).toBe(0);
  });

  it('advances interval exponentially on correct answer (score 1)', () => {
    const prev: UserPerformance = {
      questionId: 'q1',
      lastReviewedAt: '2026-10-28T00:00:00Z',
      nextReviewAt: '2026-10-29T00:00:00Z',
      intervalDays: 2,
      repetitionCount: 1,
      consecutiveCorrect: 1,
      easeFactor: 2.5,
      lastScore: 1
    };
    const next = calculateNextReview(prev, 1);
    expect(next.intervalDays).toBeGreaterThan(prev.intervalDays);
    expect(next.consecutiveCorrect).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify failure**
Run: `npx vitest run tests/srs.test.ts`
Expected: FAIL (module `../src/services/srs` not found).

- [ ] **Step 3: Implement domain types in `src/types/index.ts` and SM-2 engine in `src/services/srs.ts`**
Implement `calculateNextReview` updating `intervalDays = Math.round(prev.intervalDays * prev.easeFactor)` on success and `intervalDays = 1` on failure, with date addition.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/srs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/types/index.ts src/services/srs.ts tests/srs.test.ts
git commit -m "feat: add domain types and sm-2 spaced repetition engine"
```

---

### Task 3: Local Storage & Database Layer

**Files:**
- Create: `electron/services/db.ts`
- Test: `tests/db.test.ts`

**Interfaces:**
- Consumes: Types from `src/types/index.ts`.
- Produces:
  - `DatabaseService`:
    - `getDisciplines(): Discipline[]`
    - `createDiscipline(name: string, color?: string): Discipline`
    - `deleteDiscipline(id: string): void`
    - `saveDocument(doc: Document): void`
    - `getDocuments(disciplineId: string): Document[]`
    - `saveQuestions(questions: Question[]): void`
    - `getDueQuestions(disciplineId: string): Question[]`
    - `recordAnswer(questionId: string, isCorrect: boolean): void`
    - `getSettings(): AISettings`
    - `saveSettings(settings: AISettings): void`

- [ ] **Step 1: Write failing database service tests**
```typescript
// tests/db.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from '../electron/services/db';

describe('DatabaseService', () => {
  let db: DatabaseService;
  beforeEach(() => {
    db = new DatabaseService(':memory:');
  });

  it('creates and lists disciplines', () => {
    const disc = db.createDiscipline('Cálculo I', '#0a84ff');
    expect(disc.id).toBeDefined();
    expect(disc.name).toBe('Cálculo I');
    const all = db.getDisciplines();
    expect(all.length).toBe(1);
    expect(all[0].name).toBe('Cálculo I');
  });

  it('records question performance and queries due reviews', () => {
    const disc = db.createDiscipline('Física', '#34c759');
    const q = {
      id: 'q1',
      disciplineId: disc.id,
      topic: 'Cinemática',
      statement: 'Assinale a afirmativa correta:',
      options: [
        { id: 'a', text: 'Opção A', isCorrect: true, explanation: 'Certa' },
        { id: 'b', text: 'Opção B', isCorrect: false, explanation: 'Errada' }
      ],
      sourceType: 'simulado' as const,
      createdAt: new Date().toISOString()
    };
    db.saveQuestions([q]);
    db.recordAnswer('q1', false); // student missed it
    const due = db.getDueQuestions(disc.id);
    expect(due.length).toBe(1);
    expect(due[0].id).toBe('q1');
  });
});
```

- [ ] **Step 2: Run test to verify failure**
Run: `npx vitest run tests/db.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `DatabaseService` in `electron/services/db.ts`**
Use SQLite schema (or memory mode when `:memory:`) with tables: `disciplines`, `documents`, `questions`, `performance`, `settings`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add electron/services/db.ts tests/db.test.ts
git commit -m "feat: implement local database persistence service"
```

---

### Task 4: PDF Extraction & Context Chunking Service

**Files:**
- Create: `electron/services/pdf.ts`
- Test: `tests/pdf.test.ts`

**Interfaces:**
- Produces:
  - `extractTextFromPdf(filePath: string): Promise<{ text: string; pages: number }>`
  - `chunkText(text: string, maxTokensPerChunk?: number): string[]`

- [ ] **Step 1: Write tests for PDF extraction and chunking**
```typescript
// tests/pdf.test.ts
import { describe, it, expect } from 'vitest';
import { chunkText } from '../electron/services/pdf';

describe('PDF Chunking', () => {
  it('splits long text into chunks within token budget', () => {
    const text = 'Parágrafo sobre limites e funções. '.repeat(500);
    const chunks = chunkText(text, 500);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThan(3000);
    }
  });

  it('handles empty or whitespace text gracefully', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n  ')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify failure**
Run: `npx vitest run tests/pdf.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `extractTextFromPdf` and `chunkText` in `electron/services/pdf.ts`**
Wrap `pdf-parse` buffer reader with structured section chunking and error catching for unreadable files.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/pdf.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add electron/services/pdf.ts tests/pdf.test.ts
git commit -m "feat: implement pdf text extraction and chunking service"
```

---

### Task 5: AI Prompt Engineering & Client Service

**Files:**
- Create: `electron/services/ai.ts`
- Test: `tests/ai.test.ts`

**Interfaces:**
- Consumes: `AISettings`, `Question` from `src/types/index.ts`.
- Produces:
  - `generateSummary(content: string, mode: 'explicativo' | 'sintese', settings: AISettings): Promise<string>`
  - `generateQuestions(content: string, count: number, settings: AISettings): Promise<Question[]>`
  - `generateSimulado(content: string, settings: AISettings): Promise<{ readingGuide: string; questions: Question[] }>`

- [ ] **Step 1: Write unit tests verifying prompt schemas and JSON parsing**
```typescript
// tests/ai.test.ts
import { describe, it, expect } from 'vitest';
import { buildConcursoPrompt, parseQuestionsJson } from '../electron/services/ai';

describe('AI Question Generation Engine', () => {
  it('builds prompt strictly enforcing balanced distractors and explanations', () => {
    const prompt = buildConcursoPrompt('Derivadas parciais...', 3);
    expect(prompt).toContain('concurso');
    expect(prompt).toContain('justificativa');
    expect(prompt).toContain('distratores');
  });

  it('safely parses valid structured questions JSON', () => {
    const raw = JSON.stringify([
      {
        topic: 'Limites',
        statement: 'Seja f(x)... Assinale a correta:',
        options: [
          { id: 'a', text: 'Alternativa A', isCorrect: false, explanation: 'Incorreta porque...' },
          { id: 'b', text: 'Alternativa B', isCorrect: true, explanation: 'Correta conforme...' },
          { id: 'c', text: 'Alternativa C', isCorrect: false, explanation: 'Falsa devido a...' },
          { id: 'd', text: 'Alternativa D', isCorrect: false, explanation: 'Errada pois...' }
        ]
      }
    ]);
    const parsed = parseQuestionsJson(raw, 'disc1', 'doc1');
    expect(parsed.length).toBe(1);
    expect(parsed[0].options.length).toBe(4);
    expect(parsed[0].options[1].isCorrect).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify failure**
Run: `npx vitest run tests/ai.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement prompt builders, JSON parser, and OpenAI-compatible client in `electron/services/ai.ts`**
Use `fetch` pointing to `${settings.baseUrl}/chat/completions` with bearer token `${settings.apiKey}`, model `${settings.model}`, temperature 0.3 for consistency.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/ai.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add electron/services/ai.ts tests/ai.test.ts
git commit -m "feat: implement ai client with concurso prompt engineering"
```

---

### Task 6: Electron Main, Preload & IPC Bridge

**Files:**
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Create: `electron/ipc/channels.ts`
- Create: `src/types/electron.d.ts`

**Interfaces:**
- Exposes `window.electronAPI` to Renderer with typed methods:
  - `disciplines: { list, create, delete }`
  - `documents: { upload, list, getText }`
  - `study: { generateSummary, generateQuestions, generateSimulado, submitAnswer }`
  - `srs: { getDueQuestions, recordReview }`
  - `settings: { get, save }`

- [ ] **Step 1: Define IPC channels constants in `electron/ipc/channels.ts` and window typing in `src/types/electron.d.ts`**
Define safe string constants for all IPC messages.

- [ ] **Step 2: Implement `electron/preload.ts` with `contextBridge.exposeInMainWorld`**
Expose only strictly validated methods, preventing raw Node.js access in renderer.

- [ ] **Step 3: Implement `electron/main.ts`**
Create `BrowserWindow` with security flags (`nodeIntegration: false`, `contextIsolation: true`, `preload`), initialize `DatabaseService`, and register all IPC handlers.

- [ ] **Step 4: Verify TypeScript compilation**
Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add electron/main.ts electron/preload.ts electron/ipc/channels.ts src/types/electron.d.ts
git commit -m "feat: wire electron main process and secure ipc bridge"
```

---

### Task 7: Renderer Shell & Navigation Sidebar (3-Column Layout)

**Files:**
- Create: `src/components/Sidebar.tsx`
- Create: `src/App.tsx`
- Modify: `src/main.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `window.electronAPI.disciplines`, `window.electronAPI.srs`.
- Produces:
  - Active discipline selector.
  - "+ Nova Disciplina" dialog.
  - Document list per discipline with "+ Anexar PDF".
  - "Revisão Espaçada do Dia" card showing pending count and "Revisar Agora" button.

- [ ] **Step 1: Write `src/components/Sidebar.tsx`**
Implement the left column with clean modern styles, icons from `lucide-react`, badge with count of due questions, and discipline selection state.

- [ ] **Step 2: Mount 3-column container in `src/App.tsx`**
Layout grid: `grid grid-cols-[240px_1fr_360px] h-screen overflow-hidden`.

- [ ] **Step 3: Run build test**
Run: `npm run build`
Expected: PASS (Vite generates output in `dist`).

- [ ] **Step 4: Commit**
```bash
git add src/components/Sidebar.tsx src/App.tsx src/main.tsx src/index.css
git commit -m "feat: build application shell and sidebar navigation"
```

---

### Task 8: Document Reader Column (Central Viewport)

**Files:**
- Create: `src/components/DocumentViewer.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Active `Document` text and `SimuladoSession` phase (`reading` vs `exam`).
- Produces:
  - Normal reading view: formatted text of selected PDF with search and page navigation.
  - Simulado Phase 1: highlights essential topics generated by AI.
  - Simulado Phase 2: "Modo Prova" with text hidden/collapsed and clear message: `"Modo Prova Ativo: foco total nas questões. O gabarito com justificativas será exibido ao finalizar."`

- [ ] **Step 1: Implement `src/components/DocumentViewer.tsx`**
Add clean typography, status indicators, and closed-book exam state toggle.

- [ ] **Step 2: Connect to `App.tsx` state**
Pass active document text and active study mode.

- [ ] **Step 3: Verify build**
Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add src/components/DocumentViewer.tsx src/App.tsx
git commit -m "feat: build central document viewer with closed-book exam mode"
```

---

### Task 9: Study Panel — Resumos & Questões Avulsas

**Files:**
- Create: `src/components/StudyPanel.tsx`
- Create: `src/components/SummaryTab.tsx`
- Create: `src/components/PracticeTab.tsx`

**Interfaces:**
- Consumes: `window.electronAPI.study.generateSummary`, `window.electronAPI.study.generateQuestions`.
- Produces:
  - Tab selector: `[ Resumos ] | [ Questões ] | [ Simulado ]`.
  - SummaryTab: toggles "Explicativo" (didático/Feynman) vs "Síntese" (tópicos).
  - PracticeTab: quick quiz on selected topics with instant answer validation and explanations.

- [ ] **Step 1: Implement `SummaryTab.tsx`**
Buttons to trigger summary generation, loading spinner, and formatted markdown/text renderer.

- [ ] **Step 2: Implement `PracticeTab.tsx`**
Question generator, option selector, immediate answer reveal with explanation.

- [ ] **Step 3: Integrate into `StudyPanel.tsx`**
Host the tabs with clean transitions.

- [ ] **Step 4: Verify build**
Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/components/StudyPanel.tsx src/components/SummaryTab.tsx src/components/PracticeTab.tsx
git commit -m "feat: implement resumos and practice questions study tabs"
```

---

### Task 10: Study Panel — Simulado Diagnóstico

**Files:**
- Create: `src/components/ExamTab.tsx`
- Create: `src/components/ExamResults.tsx`
- Modify: `src/components/StudyPanel.tsx`

**Interfaces:**
- Consumes: `window.electronAPI.study.generateSimulado`, `window.electronAPI.study.submitAnswer`.
- Produces:
  - 2-Phase Simulado flow:
    - Phase 1: Guided study text rendered in center, "Iniciar Simulado" button on right.
    - Phase 2: Questions A, B, C, D one by one.
    - Phase 3: Results screen showing score, weak spots/missed topics, and confirmation that missed questions were saved to daily Spaced Repetition queue.

- [ ] **Step 1: Implement `ExamTab.tsx`**
Radio buttons for options, "Confirmar Resposta", progress indicator (ex: "Questão 3 de 5").

- [ ] **Step 2: Implement `ExamResults.tsx`**
Summary cards showing accuracy %, breakdown of correct/incorrect questions, and detailed rationale for each alternative.

- [ ] **Step 3: Wire database recording**
Incorrect answers automatically trigger `window.electronAPI.study.submitAnswer` with `isCorrect: false` to insert/update in `UserPerformance`.

- [ ] **Step 4: Verify build**
Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/components/ExamTab.tsx src/components/ExamResults.tsx src/components/StudyPanel.tsx
git commit -m "feat: implement diagnostic exam simulator and results view"
```

---

### Task 11: Spaced Repetition Modal & Settings Modal

**Files:**
- Create: `src/components/ReviewModal.tsx`
- Create: `src/components/SettingsModal.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `window.electronAPI.srs.getDueQuestions`, `window.electronAPI.srs.recordReview`, `window.electronAPI.settings`.
- Produces:
  - "Revisar Agora" Modal: plays through saved due questions 100% offline, updating SM-2 intervals.
  - "Configurações" Modal: configure AI provider URL (Omniroute/9router/Ollama), API Key, and Model name with "Testar Conexão" button.

- [ ] **Step 1: Implement `ReviewModal.tsx`**
Display pending due questions, collect answer, update SM-2 performance, and display celebratory "Parabéns, revisão diária concluída!" on finish.

- [ ] **Step 2: Implement `SettingsModal.tsx`**
Form with `Base URL`, `API Key`, `Model Name`, and local validation.

- [ ] **Step 3: Mount modals in `App.tsx`**
Trigger from Sidebar "Revisar Agora" badge and settings gear icon.

- [ ] **Step 4: Verify build**
Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/components/ReviewModal.tsx src/components/SettingsModal.tsx src/components/Sidebar.tsx src/App.tsx
git commit -m "feat: add daily review modal and ai settings configuration"
```

---

### Task 12: End-to-End Verification & Presentation Readiness

**Files:**
- Create: `tests/e2e-flow.test.ts`
- Create: `README.md`

**Interfaces:**
- Verifies: Full study cycle from discipline creation, document upload, summary generation, exam taking, and spaced review queuing.

- [ ] **Step 1: Write integration tests for end-to-end data flow**
```typescript
// tests/e2e-flow.test.ts
import { describe, it, expect } from 'vitest';
import { DatabaseService } from '../electron/services/db';
import { calculateNextReview } from '../src/services/srs';

describe('End-to-End Learning Loop', () => {
  it('records exam failure, enqueues to SRS, and graduates upon correct review', () => {
    const db = new DatabaseService(':memory:');
    const disc = db.createDiscipline('Algoritmos', '#0071e3');
    const q = {
      id: 'q_sort',
      disciplineId: disc.id,
      topic: 'Ordenação',
      statement: 'Qual a complexidade do QuickSort no pior caso?',
      options: [
        { id: 'a', text: 'O(n log n)', isCorrect: false, explanation: 'Caso médio' },
        { id: 'b', text: 'O(n^2)', isCorrect: true, explanation: 'Pior caso com pivô ruim' }
      ],
      sourceType: 'simulado' as const,
      createdAt: new Date().toISOString()
    };
    db.saveQuestions([q]);

    // Student fails question in Simulado
    db.recordAnswer('q_sort', false);
    let due = db.getDueQuestions(disc.id);
    expect(due.length).toBe(1);

    // Student opens Daily Review and gets it right
    db.recordAnswer('q_sort', true);
    // Interval increases, no longer due today
    due = db.getDueQuestions(disc.id);
    expect(due.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run all test suites**
Run: `npm test`
Expected: All unit and integration test suites PASS.

- [ ] **Step 3: Document presentation guide in `README.md`**
Include step-by-step presentation walkthrough for the college tech fair (creating discipline, uploading PDF, generating summary, running diagnostic exam, demonstrating daily spaced repetition review).

- [ ] **Step 4: Final commit**
```bash
git add tests/e2e-flow.test.ts README.md
git commit -m "docs: add presentation guide and full integration test"
```
