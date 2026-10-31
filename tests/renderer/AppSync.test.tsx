import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../src/renderer/App';
import { ProbingSession } from '../../src/shared/types';

describe('App Session Synchronization and Global Dictate', () => {
  beforeEach(() => {
    (window as any).api = {
      startSession: vi.fn().mockImplementation((mode, goal) =>
        Promise.resolve({
          id: 'sess-new',
          mode,
          phase: 'goal_orientation',
          goal,
          goalClarificationOptions: ['Opção 1', 'Opção 2'],
          questionCount: 0,
          frontierClarity: 0,
          attempts: [],
          nodesState: {},
        } as ProbingSession)
      ),
      getGraphState: vi.fn().mockResolvedValue([]),
      getSession: vi.fn().mockResolvedValue(null),
      windowAction: vi.fn(),
    };
  });

  it('resets SessionView when + TEACHING is clicked in the Sidebar', async () => {
    render(<App />);

    const newTeachingBtn = screen.getByText('+ TEACHING');
    fireEvent.click(newTeachingBtn);

    await waitFor(() => {
      expect((window as any).api.startSession).toHaveBeenCalledWith('teaching', 'Nova Trilha Socrática');
      expect(screen.getByText('Opção 1')).toBeDefined();
    });
  });

  it('triggers global toggle-dictate event when status bar Dictate button is clicked', () => {
    const eventSpy = vi.fn();
    window.addEventListener('toggle-dictate', eventSpy);

    render(<App />);
    const dictateBtn = screen.getByRole('button', { name: /dictate|ouvindo/i });
    fireEvent.click(dictateBtn);

    expect(eventSpy).toHaveBeenCalled();
    window.removeEventListener('toggle-dictate', eventSpy);
  });
});
