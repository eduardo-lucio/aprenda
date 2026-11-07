import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import App from '../../src/renderer/App';
import { ProbingSession } from '../../src/shared/types';

describe('App Session Synchronization, Settings Modal, and Global Dictate', () => {
  beforeEach(() => {
    (window as any).api = {
      startSession: vi.fn().mockImplementation((mode, goal) =>
        Promise.resolve({
          id: 'sess-new',
          mode,
          disciplineId: 'osi-layer3',
          phase: 'goal_orientation',
          goal,
          goalClarificationOptions: ['Opção 1', 'Opção 2'],
          questionCount: 0,
          frontierClarity: 0,
          attempts: [],
          socraticSteps: [],
          nodesState: {},
        } as ProbingSession)
      ),
      getGraphState: vi.fn().mockResolvedValue([]),
      getSession: vi.fn().mockResolvedValue(null),
      windowAction: vi.fn(),
      updateSettings: vi.fn().mockResolvedValue({ success: true }),
    };
    localStorage.clear();
  });

  it('prompts user for goal on + TEACHING click and starts session upon input submission', async () => {
    render(<App />);

    // Click + TEACHING
    const newTeachingBtn = screen.getByText('+ Nova sessão');
    fireEvent.click(newTeachingBtn);

    // Should NOT have called startSession automatically!
    expect((window as any).api.startSession).not.toHaveBeenCalled();

    // The goal input is displayed
    const input = screen.getByPlaceholderText(/ex\.: equações do 2º grau/i);
    fireEvent.change(input, { target: { value: 'Cálculo Diferencial' } });

    const startBtn = screen.getByRole('button', { name: /^começar$/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect((window as any).api.startSession).toHaveBeenCalledWith('teaching', 'Cálculo Diferencial');
      expect(screen.getByText('Opção 1')).toBeDefined();
    });
  });

  it('opens and interacts with the Settings Modal when settings button is clicked', async () => {
    render(<App />);

    const settingsBtn = screen.getByRole('button', { name: /^configurações$/i });
    fireEvent.click(settingsBtn);

    const dialog = screen.getByRole('dialog', { name: 'Configurações' });
    expect(within(dialog).getByText('Provedores de IA')).toBeDefined();
    expect(within(dialog).getByText('+ Adicionar provedor')).toBeDefined();

    // Model tab: a single main model (no fake "cheap"/"vision" slots)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Modelo' }));
    expect(within(dialog).getByText('Modelo principal')).toBeDefined();
    expect(within(dialog).queryByText(/cheap|vision/i)).toBeNull();

    // Close settings modal
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Configurações' })).toBeNull();
    });
  });

  it('switches the whole interface to English from Settings → Geral', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^configurações$/i }));
    const dialog = screen.getByRole('dialog', { name: 'Configurações' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Geral' }));
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Idioma' }), { target: { value: 'en' } });

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Settings' })).toBeDefined();
    });
    expect(screen.getByText('+ New session')).toBeDefined();
    expect(screen.getByText('What do you want to learn?')).toBeDefined();
    expect((window as any).api.updateSettings).toHaveBeenLastCalledWith(expect.objectContaining({ uiLanguage: 'en' }));
  });

  it('triggers global toggle-dictate event when status bar Dictate button is clicked', () => {
    const eventSpy = vi.fn();
    window.addEventListener('toggle-dictate', eventSpy);

    render(<App />);
    const dictateBtn = screen.getByRole('button', { name: /ditado|ouvindo/i });
    fireEvent.click(dictateBtn);

    expect(eventSpy).toHaveBeenCalled();
    window.removeEventListener('toggle-dictate', eventSpy);
  });
});
