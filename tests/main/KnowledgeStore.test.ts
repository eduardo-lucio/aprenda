import { describe, it, expect } from 'vitest';
import { KnowledgeStore } from '../../src/main/knowledge/KnowledgeStore';
import { ConceptNode } from '../../src/shared/types';

describe('KnowledgeStore (Zero Pre-loaded Content)', () => {
  const sampleNodes: ConceptNode[] = [
    {
      id: 'calc-limites',
      title: 'Limites e Continuidade',
      summary: 'Comportamento de funções próximo a um ponto.',
      level: 1,
      prerequisites: [],
      unconditionalTruth: 'O limite descreve a tendência da função na vizinhança do ponto.',
      status: 'untested',
    },
    {
      id: 'calc-derivada',
      title: 'Definição de Derivada',
      summary: 'Taxa de variação instantânea.',
      level: 2,
      prerequisites: ['calc-limites'],
      unconditionalTruth: 'A derivada é o limite da razão incremental.',
      status: 'untested',
    },
    {
      id: 'calc-regra-cadeia',
      title: 'Regra da Cadeia',
      summary: 'Derivação de funções compostas.',
      level: 3,
      prerequisites: ['calc-derivada'],
      unconditionalTruth: 'A derivada da composta é o produto das derivadas das partes.',
      status: 'untested',
    },
  ];

  it('starts completely empty with no pre-loaded nodes', () => {
    const store = new KnowledgeStore();
    expect(store.getNodes()).toEqual([]);
  });

  it('stores dynamically generated nodes and retrieves recursive prerequisites up to roots', () => {
    const store = new KnowledgeStore();
    store.setNodes(sampleNodes);

    expect(store.getNodes().length).toBe(3);
    const prereqs = store.getPrerequisites('calc-regra-cadeia');
    const ids = prereqs.map((n) => n.id);
    expect(ids).toContain('calc-limites');
    expect(ids).toContain('calc-derivada');
  });

  it('returns topological strand ordered by level', () => {
    const store = new KnowledgeStore(sampleNodes);
    const strand = store.getStrand();
    expect(strand.length).toBe(3);
    expect(strand[0].id).toBe('calc-limites');
    expect(strand[2].id).toBe('calc-regra-cadeia');
  });
});
