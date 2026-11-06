import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
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

  it('renders pills with full titles, status badges and a Portuguese legend', () => {
    render(<KnowledgeGraph nodes={sampleNodes} goal="Entender redes" />);

    expect(screen.getByText('Camada Física: Bits')).toBeDefined();
    expect(screen.getByText('Camada de Enlace: MAC')).toBeDefined();
    expect(screen.getByText('TTL e Prevenção de Loops')).toBeDefined();
    expect(screen.getByText('Entender redes')).toBeDefined();

    // Each status appears in the legend and on the pill that has it
    expect(screen.getAllByText(/domínio/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/falso positivo/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/fronteira/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/não testado/i)).toHaveLength(1); // legend only
  });

  it('opens the side panel when a node is clicked and closes it with Escape', () => {
    const onNodeClick = vi.fn();
    render(<KnowledgeGraph nodes={sampleNodes} onNodeSelect={onNodeClick} />);

    fireEvent.click(screen.getByText('TTL e Prevenção de Loops'));

    expect(onNodeClick).toHaveBeenCalledWith('osi-l3-ttl');
    const panel = screen.getByTestId('node-detail-panel');
    expect(panel.textContent).toContain('Ao atingir 0 o pacote é descartado.');
    expect(panel.textContent).toContain('Camada de Enlace: MAC'); // prerequisite listed

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('node-detail-panel')).toBeNull();
  });

  it('opens the panel with the keyboard (Enter) and navigates to a prerequisite from the panel', () => {
    render(<KnowledgeGraph nodes={sampleNodes} />);
    const pill = screen.getByRole('button', { name: /TTL e Prevenção de Loops — Fronteira/i });
    fireEvent.keyDown(pill, { key: 'Enter' });
    const panel = screen.getByTestId('node-detail-panel');
    fireEvent.click(within(panel).getByRole('button', { name: /Camada de Enlace: MAC/i }));
    expect(screen.getByTestId('node-detail-panel').textContent).toContain('Endereços MAC são locais ao enlace.');
  });

  it('only offers the teach button when onStartSocratic is provided', () => {
    const onStart = vi.fn();
    const { rerender } = render(<KnowledgeGraph nodes={sampleNodes} />);
    fireEvent.click(screen.getByText('TTL e Prevenção de Loops'));
    expect(screen.queryByRole('button', { name: /ensinar este conceito/i })).toBeNull();

    rerender(<KnowledgeGraph nodes={sampleNodes} onStartSocratic={onStart} />);
    fireEvent.click(screen.getByRole('button', { name: /ensinar este conceito/i }));
    expect(onStart).toHaveBeenCalledWith('osi-l3-ttl');
  });

  it('highlights the prerequisite chain of the hovered concept and dims the rest', () => {
    render(<KnowledgeGraph nodes={sampleNodes} />);
    const edges = screen.getAllByTestId('graph-edge');
    expect(edges).toHaveLength(2);
    expect(edges.every((e) => e.getAttribute('stroke-opacity') === '0.16')).toBe(true);

    fireEvent.mouseEnter(screen.getByRole('button', { name: /TTL e Prevenção de Loops — Fronteira/i }));
    const after = screen.getAllByTestId('graph-edge').map((e) => Number(e.getAttribute('stroke-opacity')));
    expect(after.every((o) => o > 0.8)).toBe(true); // both edges are on the chain of the hovered node

    fireEvent.mouseLeave(screen.getByRole('button', { name: /TTL e Prevenção de Loops — Fronteira/i }));
    expect(screen.getAllByTestId('graph-edge')[0].getAttribute('stroke-opacity')).toBe('0.16');
  });

  it('still draws every node when levels are missing or outside 1–4', () => {
    const odd: ConceptNode[] = [
      { ...sampleNodes[0], id: 'a', title: 'Nível zero', level: 0, prerequisites: [] },
      { ...sampleNodes[1], id: 'b', title: 'Nível nove', level: 9, prerequisites: ['a'] },
    ];
    render(<KnowledgeGraph nodes={odd} />);
    expect(screen.getByText('Nível zero')).toBeDefined();
    expect(screen.getByText('Nível nove')).toBeDefined();
  });
});
