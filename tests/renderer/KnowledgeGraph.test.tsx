import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { KnowledgeGraph } from '../../src/renderer/components/KnowledgeGraph';
import { ConceptNode } from '../../src/shared/types';

describe('KnowledgeGraph Component', () => {
  const sampleNodes: ConceptNode[] = [
    {
      id: 'osi-l1-bits',
      title: 'Camada Física: Bits',
      summary: 'Sinais binários brutos.',
      level: 1,
      prerequisites: [],
      unconditionalTruth: 'Na camada física, a informação é apenas sinal elétrico ou luz.',
      status: 'mastered',
    },
    {
      id: 'osi-l2-mac',
      title: 'Camada de Enlace: MAC',
      summary: 'Quadros locais.',
      level: 1,
      prerequisites: ['osi-l1-bits'],
      unconditionalTruth: 'Endereços MAC são locais ao enlace.',
      status: 'false_positive',
    },
    {
      id: 'osi-l3-ttl',
      title: 'TTL e Prevenção de Loops',
      summary: 'Decremento a cada salto.',
      level: 3,
      prerequisites: ['osi-l2-mac'],
      unconditionalTruth: 'Ao atingir 0 o pacote é descartado.',
      status: 'frontier',
    },
  ];

  it('renders nodes with their titles and status indicators', () => {
    render(<KnowledgeGraph nodes={sampleNodes} />);

    expect(screen.getByText('Camada Física: Bits')).toBeDefined();
    expect(screen.getByText('Camada de Enlace: MAC')).toBeDefined();
    expect(screen.getByText('TTL e Prevenção de Loops')).toBeDefined();

    // Expect status badges / legend to be present
    expect(screen.getByText(/domínio/i)).toBeDefined();
    expect(screen.getByText(/falso positivo/i)).toBeDefined();
    expect(screen.getByText(/fronteira/i)).toBeDefined();
  });

  it('opens NodeDetailModal when a node is clicked', () => {
    const onNodeClick = vi.fn();
    render(<KnowledgeGraph nodes={sampleNodes} onNodeSelect={onNodeClick} />);

    const nodeElement = screen.getByText('TTL e Prevenção de Loops');
    fireEvent.click(nodeElement);

    expect(onNodeClick).toHaveBeenCalledWith('osi-l3-ttl');
    // Check that unconditional truth is displayed in modal/popover
    expect(screen.getByText(/ao atingir 0 o pacote é descartado/i)).toBeDefined();
  });
});
