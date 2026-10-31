import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../src/renderer/App';
import { ProbingSession } from '../../src/shared/types';

describe('App Session Synchronization, Settings Modal, and Global Dictate', () => {
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

  it('prompts user for goal on + TEACHING click and starts session upon input submission', async () => {
    render(<App />);

    // Click + TEACHING
    const newTeachingBtn = screen.getByText('+ TEACHING');
    fireEvent.click(newTeachingBtn);

    // Should NOT have called startSession automatically!
    expect((window as any).api.startSession).not.toHaveBeenCalled();

    // The goal input is displayed
    const input = screen.getByPlaceholderText(/ex: quero aprender a camada 3/i);
    fireEvent.change(input, { target: { value: 'Dominar TTL e Rotas' } });

    const startBtn = screen.getByRole('button', { name: /iniciar diagnóstico/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect((window as any).api.startSession).toHaveBeenCalledWith('teaching', 'Dominar TTL e Rotas');
      expect(screen.getByText('Opção 1')).toBeDefined();
    });
  });

  it('opens and interacts with the Settings Modal when settings button is clicked', async () => {
    render(<App />);

    const settingsBtn = screen.getByRole('button', { name: /configurações do agente/i });
    fireEvent.click(settingsBtn);

    expect(screen.getByText('Settings')).toBeDefined();
    expect(screen.getByText('PROVIDERS')).toBeDefined();
    expect(screen.getByText('+ Add a provider')).toBeDefined();

    // Switch to Agent tab
    const agentTabBtn = screen.getByRole('button', { name: 'Agent' });
    fireEvent.click(agentTabBtn);
    expect(screen.getByText('MODELS')).toBeDefined();
    expect(screen.getByText('Strong')).toBeDefined();

    // Close settings modal
    const closeBtn = screen.getByLabelText(/fechar/i);
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText('Settings')).toBeNull();
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
