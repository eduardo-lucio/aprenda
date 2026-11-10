import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryModal } from '../../src/renderer/components/MemoryModal';
import { Sidebar } from '../../src/renderer/components/Sidebar';
import type { DemonstratedConcept } from '../../src/shared/types';

const entry = (id: string, over: Partial<DemonstratedConcept> = {}): DemonstratedConcept => ({
  id, title: `Conceito ${id}`, truth: `Verdade de ${id}.`, discipline: 'Redes', sessionId: 's1', source: 'lesson',
  firstAt: Date.UTC(2026, 10, 1), lastAt: Date.UTC(2026, 10, 9), times: 1, ...over,
});
const api = () => (window as any).api;

describe('memory screen (A2)', () => {
  beforeEach(() => {
    (window as any).api = {
      listMemory: vi.fn().mockResolvedValue([entry('a'), entry('b', { source: 'practice', times: 3 }), entry('c', { discipline: 'Python' })]),
      deleteMemory: vi.fn().mockResolvedValue([entry('b'), entry('c', { discipline: 'Python' })]),
      clearMemory: vi.fn().mockResolvedValue([]),
    };
  });

  it('is not on screen, and reads nothing, while closed', () => {
    render(<MemoryModal isOpen={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api().listMemory).not.toHaveBeenCalled();
  });

  it('lists what is kept by area, with where and how often it was shown', async () => {
    render(<MemoryModal isOpen onClose={() => {}} />);
    expect(await screen.findAllByTestId('memory-entry')).toHaveLength(3);
    expect(screen.getByText('Redes')).toBeDefined();
    expect(screen.getByText('Python')).toBeDefined();
    expect(screen.getByText('Verdade de a.')).toBeDefined();
    expect(screen.getByText(/Prática · .*2026 · demonstrado 3 vezes/)).toBeDefined();
  });

  it('says so when nothing is kept', async () => {
    api().listMemory.mockResolvedValue([]);
    render(<MemoryModal isOpen onClose={() => {}} />);
    expect(await screen.findByTestId('memory-empty')).toBeDefined();
    expect(screen.queryByTestId('memory-practice')).toBeNull();
  });

  it('erases one item', async () => {
    render(<MemoryModal isOpen onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Apagar Conceito a da memória' }));
    await waitFor(() => expect(screen.getAllByTestId('memory-entry')).toHaveLength(2));
    expect(api().deleteMemory).toHaveBeenCalledWith(['a']);
  });

  it('erases everything only after a confirmation', async () => {
    render(<MemoryModal isOpen onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Apagar tudo' }));
    expect(api().clearMemory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sim, apagar' }));
    expect(await screen.findByTestId('memory-empty')).toBeDefined();
    expect(api().clearMemory).toHaveBeenCalledTimes(1);
  });

  it('opens a practice over the selected concepts', async () => {
    const onPractice = vi.fn();
    render(<MemoryModal isOpen onClose={() => {}} onPractice={onPractice} />);
    const button = (await screen.findByTestId('memory-practice')) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Conceito a' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Conceito b' }));
    expect(button.textContent).toBe('Praticar os 2 selecionados');
    fireEvent.click(button);
    expect(onPractice).toHaveBeenCalledWith({
      material: 'Redes',
      targets: [{ id: 'a', title: 'Conceito a', truth: 'Verdade de a.' }, { id: 'b', title: 'Conceito b', truth: 'Verdade de b.' }],
    });
  });

  it('closes with Escape and shows a read failure', async () => {
    api().listMemory.mockRejectedValue(new Error('disco cheio'));
    const onClose = vi.fn();
    render(<MemoryModal isOpen onClose={onClose} />);
    expect(await screen.findByText(/disco cheio/)).toBeDefined();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('the sidebar has a way in', () => {
    const onOpenMemory = vi.fn();
    render(<Sidebar sessions={[]} onSelectSession={() => {}} onNewSession={() => {}} onOpenMemory={onOpenMemory} />);
    fireEvent.click(screen.getByRole('button', { name: 'Memória' }));
    expect(onOpenMemory).toHaveBeenCalled();
  });
});
