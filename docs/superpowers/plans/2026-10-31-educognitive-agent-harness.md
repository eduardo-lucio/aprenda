# EduCognitive Agent Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-platform (Linux & Windows) Electron + React/Vite + TypeScript desktop application inspired by LearnHarness that diagnoses university student knowledge limits, exposes false positives through voice/text reasoning and confidence calibration, and delivers surgical Socratic instruction (*Predict $\rightarrow$ Teach $\rightarrow$ Check*) anchored in a live color-coded dependency DAG for Computer Networks.

**Architecture:** Electron desktop application with a Finite State Machine (FSM) in the Main process governing session stages (`goal_orientation` $\rightarrow$ `probing` [min 8 questions] $\rightarrow$ `frontier_diagnosis` $\rightarrow$ `socratic_teach` $\rightarrow$ `completed`). The Main process manages pre-indexed domain graphs, local session persistence in `userData`, and an OpenAI-compatible client connecting to external LLMs or local Ollama. The Renderer process (React 18, Vite, Tailwind CSS) renders a frameless dark theme interface with native Web Speech API voice capture, collapsible agent thinking blocks, interactive question cards, and a reactive Knowledge Graph DAG.

**Tech Stack:** Electron, TypeScript, React 18, Vite, Tailwind CSS, Lucide React, Vitest, Testing Library, KaTeX.

**Spec:** `docs/superpowers/specs/2026-10-31-educognitive-agent-harness-design.md`

## Global Constraints

- Platform support: Linux and Windows desktop environments.
- Stack: TypeScript strictly across Electron Main, Preload contextBridge, and React Renderer.
- Visual Theme: Frameless dark UI (`#0a0a0a` / `#111111`) with custom window controls and typography matching the LearnHarness aesthetic.
- Voice Capture: Web Speech API (Chromium native `webkitSpeechRecognition`) with seamless fallback to typed text in the *"Your thinking"* channel.
- Probing Rule: Strict floor of 8 questions; continues adaptively until 100% frontier clarity is reached or manual transition is triggered.
- Pedagogy: Evaluates student reasoning before the multiple-choice option to classify False Positives (🟡), Blind Spots (🔴), Mastery (🟢), and Frontier (🔵); teaches in 1-step increments (*Predict $\rightarrow$ Teach $\rightarrow$ Check*).
- AI Client: OpenAI-compatible HTTP client supporting configurable `baseURL`, `apiKey`, and `model`.

## Review Focus

1. **Web Speech API unsupported or permission denied**: Silently handle recognition errors and fall back gracefully to typed text without disabling the "Submit answer" button.
2. **AI Provider network failure or timeout**: Catch HTTP/timeout exceptions and offer a 1-click retry button or fallback to pre-cached heuristic rubrics so the live demo at the tech fair never hangs.
3. **Empty or trivial thinking field**: Prevent submission when reasoning is completely blank, displaying a friendly prompt: *"Explique seu raciocínio com pelo menos algumas palavras ou fale pelo microfone"*.
4. **Non-converging probing after question 8**: Expose a prominent *"Avançar para Diagnóstico"* action after the 8th question so the user can transition even if `frontierClarity` has not reached 100%.
5. **Check failure in Socratic loop**: Issue a single diagnostic repair explanation rather than trapping the student in an infinite remediation cycle during a timed presentation.

---

### Task 1: Project Scaffolding & Tooling Setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `tailwind.config.js`
- Create: `postcss.config.js`
- Create: `vitest.config.ts`
- Create: `index.html`
- Create: `src/main/main.ts`
- Create: `src/preload/preload.ts`
- Create: `src/renderer/main.tsx`
- Create: `src/renderer/App.tsx`
- Create: `src/renderer/index.css`
- Test: `tests/scaffold.test.ts`

**Interfaces:**
- Produces: Build scripts (`npm run build`, `npm run dev`, `npm test`), TypeScript paths (`@shared/*`, `@main/*`, `@renderer/*`), and verified Electron startup scripts.

- [ ] **Step 1: Write configuration files and package.json**
Configure dependencies: `electron`, `vite`, `react`, `react-dom`, `@types/react`, `@types/react-dom`, `typescript`, `tailwindcss`, `postcss`, `autoprefixer`, `lucide-react`, `vitest`, `@testing-library/react`, `jsdom`, `clsx`, `tailwind-merge`, `katex`.

- [ ] **Step 2: Create minimal Main, Preload, and React entry points**
Create `src/main/main.ts` with frameless `BrowserWindow ({ frame: false, titleBarStyle: 'hidden' })`, `src/preload/preload.ts` with placeholder `contextBridge`, and `src/renderer/App.tsx`.

- [ ] **Step 3: Write test to verify Vitest configuration**
Create `tests/scaffold.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

describe('Project Tooling', () => {
  it('initializes vitest environment successfully', () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 4: Run test to verify tooling**
Run: `npm test`  
Expected: PASS (1 test passing).

- [ ] **Step 5: Verify TypeScript compilation**
Run: `npx tsc --noEmit`  
Expected: PASS (0 type errors).

- [ ] **Step 6: Commit**
```bash
git add package.json tsconfig*.json vite.config.ts tailwind.config.js postcss.config.js vitest.config.ts index.html src/ tests/
git commit -m "chore: setup Electron, Vite, React, TypeScript and Vitest scaffolding"
```

---

### Task 2: Core Domain Types & Pre-indexed Knowledge Store (Camada 3 OSI)

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/main/knowledge/networkLayer3Nodes.ts`
- Create: `src/main/knowledge/KnowledgeStore.ts`
- Test: `tests/main/KnowledgeStore.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface ConceptNode {
    id: string;
    title: string;
    summary: string;
    level: number;
    prerequisites: string[];
    unconditionalTruth: string;
    status: 'untested' | 'mastered' | 'false_positive' | 'blind_spot' | 'frontier';
  }
  export interface KnowledgeStore {
    getNodes(): ConceptNode[];
    getNodeById(id: string): ConceptNode | undefined;
    getPrerequisites(id: string): ConceptNode[];
    getStrandForGoal(goalText: string): ConceptNode[];
  }
  ```

- [ ] **Step 1: Write failing tests for KnowledgeStore**
Test `tests/main/KnowledgeStore.test.ts` verifying loading of 12 OSI Layer 3 nodes, topological retrieval of prerequisites, and goal strand filtering:
```typescript
import { describe, it, expect } from 'vitest';
import { KnowledgeStore } from '../../src/main/knowledge/KnowledgeStore';

describe('KnowledgeStore', () => {
  it('loads pre-indexed nodes for Redes de Computadores / Camada 3', () => {
    const store = new KnowledgeStore();
    const nodes = store.getNodes();
    expect(nodes.length).toBeGreaterThanOrEqual(10);
    const ttlNode = store.getNodeById('osi-l3-ttl');
    expect(ttlNode).toBeDefined();
    expect(ttlNode?.prerequisites).toContain('osi-l3-ip-packets');
  });

  it('retrieves recursive prerequisites up to unconditional roots', () => {
    const store = new KnowledgeStore();
    const prereqs = store.getPrerequisites('osi-l3-ttl');
    const ids = prereqs.map(n => n.id);
    expect(ids).toContain('osi-l1-bits');
    expect(ids).toContain('osi-l2-mac');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/main/KnowledgeStore.test.ts`  
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `types.ts`, `networkLayer3Nodes.ts`, and `KnowledgeStore.ts`**
Define the 12 nodes: `osi-l1-bits`, `osi-l2-mac`, `osi-l3-ip-packets`, `osi-l3-ipv4-addressing`, `osi-l3-ttl`, `osi-l3-routers-vs-switches`, `osi-l3-routing-table`, `osi-l3-subnet-cidr`, `osi-l3-arp`, `osi-l3-fragmentation`, `osi-l3-icmp`, `osi-l3-static-dynamic-routing`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/main/KnowledgeStore.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/shared/types.ts src/main/knowledge/ tests/main/KnowledgeStore.test.ts
git commit -m "feat: implement domain types and pre-indexed Camada 3 KnowledgeStore"
```

---

### Task 3: Cognitive Judge & Surgical Generator Services with LLM Client

**Files:**
- Create: `src/main/services/llmClient.ts`
- Create: `src/main/prompts/cognitiveJudgePrompt.ts`
- Create: `src/main/prompts/surgicalGeneratorPrompt.ts`
- Create: `src/main/services/CognitiveJudgeService.ts`
- Test: `tests/main/CognitiveJudgeService.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface JudgeEvaluationResult {
    verdict: 'mastered' | 'false_positive' | 'blind_spot' | 'frontier';
    isCorrectOption: boolean;
    confidenceLevel: number;
    reasoningDiagnosis: string;
    identifiedMisconception?: string;
  }
  export class CognitiveJudgeService {
    evaluate(attempt: {
      node: ConceptNode;
      questionText: string;
      options: string[];
      selectedOptionIndex: number;
      correctOptionIndex: number;
      confidence: number;
      thinkingText: string;
    }): Promise<JudgeEvaluationResult>;
  }
  ```

- [ ] **Step 1: Write failing tests for CognitiveJudgeService**
Test `tests/main/CognitiveJudgeService.test.ts` validating that:
  - Correct option + wrong reasoning yields `false_positive`.
  - Wrong option + high confidence yields `blind_spot`.
  - Correct option + solid reasoning yields `mastered`.
  - Offline/mock fallback works on API failure.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/main/CognitiveJudgeService.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement prompt builders, LLM client, and CognitiveJudgeService**
Implement prompt emphasizing: *Desconsidere a alternativa no primeiro segundo. Avalie primeiro o thinkingText. Se o aluno acertou a letra mas expressou um conceito falso, classifique estritamente como false_positive.*

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/main/CognitiveJudgeService.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/main/services/ src/main/prompts/ tests/main/CognitiveJudgeService.test.ts
git commit -m "feat: implement CognitiveJudge and SurgicalGenerator services"
```

---

### Task 4: Session State Machine (FSM) & Adaptive Probing Engine

**Files:**
- Create: `src/main/fsm/SessionStateMachine.ts`
- Test: `tests/main/SessionStateMachine.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export class SessionStateMachine {
    getState(): ProbingSession;
    startSession(mode: 'teaching' | 'practice', goalText: string): void;
    submitGoalClarification(selectedOption: string): Promise<QuestionData>;
    submitProbeAnswer(data: {
      selectedOptionIndex: number;
      confidence: number;
      thinkingText: string;
    }): Promise<{ attempt: ProbeAttempt; nextAction: 'next_question' | 'transition_diagnosis'; nextQuestion?: QuestionData }>;
    forceAdvanceToDiagnosis(): void;
    calculateFrontierClarity(): number;
  }
  ```

- [ ] **Step 1: Write failing tests for SessionStateMachine**
Test `tests/main/SessionStateMachine.test.ts`:
  - Enforces minimum floor of 8 questions before automatic transition.
  - Allows manual advance to diagnosis after question 8 even if clarity < 100%.
  - Regresses to prerequisites (Zoom-In) when a false positive or failure occurs.
  - Propagates mastery down to unconditional roots on solid answers.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/main/SessionStateMachine.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement SessionStateMachine**
Implement state transitions (`goal_orientation` $\rightarrow$ `probing` $\rightarrow$ `frontier_diagnosis` $\rightarrow$ `socratic_teach` $\rightarrow$ `completed`), tracking question count, candidate nodes queue, and DAG color states.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/main/SessionStateMachine.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/main/fsm/ tests/main/SessionStateMachine.test.ts
git commit -m "feat: implement SessionStateMachine with 8-question probing floor and Zoom-In traversal"
```

---

### Task 5: Socratic Teaching Engine (Predict $\rightarrow$ Teach $\rightarrow$ Check)

**Files:**
- Create: `src/main/socratic/SocraticEngine.ts`
- Test: `tests/main/SocraticEngine.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export class SocraticEngine {
    generatePredictStep(node: ConceptNode): Promise<{ questionText: string; promptGoal: string }>;
    submitPrediction(studentPrediction: string): Promise<{ teachProse: string }>;
    generateCheckQuestion(node: ConceptNode): Promise<CheckQuestionData>;
    evaluateCheck(studentAnswerIndex: number, checkData: CheckQuestionData): { isPassed: boolean; repairExplanation?: string };
  }
  ```

- [ ] **Step 1: Write failing tests for SocraticEngine**
Test `tests/main/SocraticEngine.test.ts` checking:
  - Generates motivating prediction nudge before teaching.
  - Resolves prediction openly in the 1-step concise teaching text.
  - Evaluates check question; upon failure, issues single corrective repair text without infinite loop.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/main/SocraticEngine.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement SocraticEngine**
Anchor every step in Principle I (unconditional truth of the node) and Principle II (motivated reasoning).

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/main/SocraticEngine.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/main/socratic/ tests/main/SocraticEngine.test.ts
git commit -m "feat: implement SocraticEngine with Predict-Teach-Check cycle and repair fallback"
```

---

### Task 6: Electron IPC Layer & Secure Preload Bridge

**Files:**
- Create: `src/main/ipc/registerIpcHandlers.ts`
- Modify: `src/preload/preload.ts`
- Modify: `src/main/main.ts`
- Test: `tests/main/ipcHandlers.test.ts`

**Interfaces:**
- Produces: Typed `window.api` accessible in the React Renderer:
  ```typescript
  export interface ElectronAPI {
    startSession: (mode: 'teaching' | 'practice', goal: string) => Promise<ProbingSession>;
    submitGoalClarification: (option: string) => Promise<any>;
    submitProbeAnswer: (data: { selectedOptionIndex: number; confidence: number; thinkingText: string }) => Promise<any>;
    advanceToDiagnosis: () => Promise<ProbingSession>;
    submitPrediction: (text: string) => Promise<any>;
    submitCheckAnswer: (selectedIndex: number) => Promise<any>;
    getGraphState: () => Promise<ConceptNode[]>;
    windowAction: (action: 'minimize' | 'maximize' | 'close') => void;
  }
  ```

- [ ] **Step 1: Write failing tests for IPC handlers**
Test `tests/main/ipcHandlers.test.ts` mocking IPC invoke and verifying correct payload forwarding to FSM and KnowledgeStore.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/main/ipcHandlers.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement IPC handlers in Main and contextBridge in Preload**
Wire secure channels via `ipcMain.handle` and expose typed API in `preload.ts`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/main/ipcHandlers.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/main/ipc/ src/preload/ src/main/main.ts tests/main/ipcHandlers.test.ts
git commit -m "feat: wire typed Electron IPC handlers and contextBridge"
```

---

### Task 7: Renderer UI Shell & Framing (LearnHarness Dark Theme)

**Files:**
- Create: `src/renderer/components/TitleBar.tsx`
- Create: `src/renderer/components/Sidebar.tsx`
- Create: `src/renderer/components/StatusBar.tsx`
- Create: `src/renderer/components/AgentThinkingBlock.tsx`
- Test: `tests/renderer/Sidebar.test.tsx`

**Interfaces:**
- Produces: Visual framework with frameless window controls, session navigation (`CAMADA 3 MODELO OSI`), collapsible `AGENT'S THINKING` accordions, and status footer with token counts.

- [ ] **Step 1: Write failing test for Sidebar navigation and title bar**
Create `tests/renderer/Sidebar.test.tsx` testing session selection, `+ TEACHING`, and filter tabs (`TEACHING`, `PRACTICE`, `ALL`).

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/renderer/Sidebar.test.tsx`  
Expected: FAIL.

- [ ] **Step 3: Implement TitleBar, Sidebar, StatusBar, and AgentThinkingBlock**
Apply dark palette (`#0a0a0a`, `#111111`, `#1e293b`), custom window controls, and serif session title headers matching screenshots.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/renderer/Sidebar.test.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/renderer/components/ tests/renderer/Sidebar.test.tsx
git commit -m "feat: implement LearnHarness UI shell, frameless TitleBar and Sidebar"
```

---

### Task 8: Question Card, Voice Dictation & Confidence Slider

**Files:**
- Create: `src/renderer/hooks/useSpeechRecognition.ts`
- Create: `src/renderer/components/ConfidenceSlider.tsx`
- Create: `src/renderer/components/ThinkingField.tsx`
- Create: `src/renderer/components/QuestionCard.tsx`
- Test: `tests/renderer/QuestionCard.test.tsx`

**Interfaces:**
- Produces: Integrated question card with:
  - Options list + "Outro / Type your own answer...".
  - Confidence slider (0% to 100%) with dynamic feedback label.
  - "YOUR THINKING" textarea with Web Speech API recording badge and keyboard shortcuts (`Enter` submit, `Shift+Enter` newline).

- [ ] **Step 1: Write failing test for QuestionCard**
Create `tests/renderer/QuestionCard.test.tsx`:
  - Blocks submission when `thinkingText` is blank.
  - Emits selected option, confidence percentage, and thinking text on submit.
  - Toggles speech recognition state safely.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/renderer/QuestionCard.test.tsx`  
Expected: FAIL.

- [ ] **Step 3: Implement useSpeechRecognition, ConfidenceSlider, ThinkingField, and QuestionCard**
Handle speech errors gracefully and bind hotkeys cleanly.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/renderer/QuestionCard.test.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/renderer/hooks/ src/renderer/components/ tests/renderer/QuestionCard.test.tsx
git commit -m "feat: implement QuestionCard with Web Speech dictation and ConfidenceSlider"
```

---

### Task 9: Interactive DAG Knowledge Graph Visualizer

**Files:**
- Create: `src/renderer/components/KnowledgeGraph.tsx`
- Create: `src/renderer/components/NodeDetailModal.tsx`
- Test: `tests/renderer/KnowledgeGraph.test.tsx`

**Interfaces:**
- Produces: Interactive SVG/HTML DAG viewer showing:
  - Level-ordered nodes (Bits $\rightarrow$ Enlace $\rightarrow$ IP/TTL $\rightarrow$ CIDR/Roteamento).
  - Dynamic color statuses: 🟢 Domínio, 🟡 Falso Positivo (com destaque pulsante), 🔴 Ponto Cego, 🔵 Fronteira, ⚪ Não testado.
  - Click-to-inspect popover showing node summary and unconditional truth.

- [ ] **Step 1: Write failing test for KnowledgeGraph rendering**
Create `tests/renderer/KnowledgeGraph.test.tsx` verifying that nodes render with correct colors and directional edges.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/renderer/KnowledgeGraph.test.tsx`  
Expected: FAIL.

- [ ] **Step 3: Implement KnowledgeGraph and NodeDetailModal**
Build clean SVG layout with bezier curves for dependency edges and status badges.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/renderer/KnowledgeGraph.test.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/renderer/components/KnowledgeGraph.tsx src/renderer/components/NodeDetailModal.tsx tests/renderer/KnowledgeGraph.test.tsx
git commit -m "feat: implement interactive color-coded DAG KnowledgeGraph component"
```

---

### Task 10: Socratic Predict-Teach-Check Views & End-to-End Integration

**Files:**
- Create: `src/renderer/components/SocraticCard.tsx`
- Create: `src/renderer/views/SessionView.tsx`
- Modify: `src/renderer/App.tsx`
- Test: `tests/renderer/SessionView.test.tsx`

**Interfaces:**
- Produces: Complete end-to-end user experience:
  - Home screen with initial goal input: *"What do you want to learn?"*.
  - Goal clarification card with multiple choices.
  - Active probing transcript with live DAG updates.
  - Socratic teaching step: open Predict prompt, concise Teach prose, and collapsed *"Check your understanding"* button.
  - Diagnostic summary and retry buttons.

- [ ] **Step 1: Write failing integration test for SessionView**
Create `tests/renderer/SessionView.test.tsx` testing the progression: Goal $\rightarrow$ Probe Q1..Q8 $\rightarrow$ Diagnosis DAG display $\rightarrow$ Socratic Predict $\rightarrow$ Teach $\rightarrow$ Check.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/renderer/SessionView.test.tsx`  
Expected: FAIL.

- [ ] **Step 3: Implement SocraticCard, SessionView, and integrate App.tsx**
Assemble all UI components with IPC listeners.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/renderer/SessionView.test.tsx`  
Expected: PASS.

- [ ] **Step 5: Run full test suite and verify build**
Run: `npm test && npm run build`  
Expected: ALL PASS with 0 build errors.

- [ ] **Step 6: Commit**
```bash
git add src/renderer/ tests/renderer/
git commit -m "feat: complete end-to-end SessionView integrating Probing, DAG and Socratic loop"
```
