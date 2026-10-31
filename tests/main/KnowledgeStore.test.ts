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

  it('returns topological strand for a given learning goal', () => {
    const store = new KnowledgeStore();
    const strand = store.getStrandForGoal('Camada 3 e TTL');
    expect(strand.length).toBeGreaterThan(0);
    const ids = strand.map(n => n.id);
    expect(ids).toContain('osi-l3-ttl');
  });
});
