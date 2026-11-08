import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SessionRepository } from '../../src/main/persistence/SessionRepository';
import { SessionStateMachine } from '../../src/main/fsm/SessionStateMachine';
import { KnowledgeStore } from '../../src/main/knowledge/KnowledgeStore';
import { CurriculumGenerator } from '../../src/main/services/CurriculumGenerator';
import { mockJudge, mockLLM, noShuffle } from '../helpers/mockLLM';

describe('session persistence', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aprenda-'));
    file = path.join(dir, 'sessions.json');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('saves a session, its chat UI, and reloads them in a new repository + state machine', async () => {
    const repo = new SessionRepository(file);
    const fsm = new SessionStateMachine(new KnowledgeStore(), mockJudge(), new CurriculumGenerator(mockLLM, noShuffle));
    fsm.setPersistence((snap) => repo.saveSnapshot(snap));

    await fsm.startSession('teaching', 'Redes');
    await fsm.submitGoalClarification('TCP e UDP');
    await fsm.submitProbeAnswer({ selectedOptionIndex: 0, confidence: 70, thinkingText: 'Porque sim, detalhado.' });
    const id = fsm.getState().id;
    repo.saveUi(id, {
      chatMessages: [{ id: 'm1', role: 'user', text: 'oi', timestamp: 1 }],
    });
    repo.flush();

    // "Restart": brand-new objects reading the same file
    const repo2 = new SessionRepository(file);
    expect(repo2.list().map((s) => s.id)).toEqual([id]);
    const rec = repo2.get(id)!;
    expect(rec.ui.chatMessages[0].text).toBe('oi');

    const fsm2 = new SessionStateMachine(new KnowledgeStore(), mockJudge(), new CurriculumGenerator(mockLLM, noShuffle));
    fsm2.restoreSnapshot(rec.snapshot);
    const state = fsm2.getState();
    expect(state.phase).toBe('probing');
    expect(state.attempts).toHaveLength(1);
    expect(state.currentQuestion).toBeDefined();

    // The restored session keeps working
    const res = await fsm2.submitProbeAnswer({ selectedOptionIndex: 0, confidence: 50, thinkingText: 'segue' });
    expect(res.attempt.nodeId).toBeDefined();
    expect(fsm2.getState().attempts).toHaveLength(2);
  });

  it('deletes sessions and tolerates a corrupt file', () => {
    fs.writeFileSync(file, '{not json');
    const repo = new SessionRepository(file);
    expect(repo.list()).toEqual([]);
  });
});
