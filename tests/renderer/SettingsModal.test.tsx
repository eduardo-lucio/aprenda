import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsModal, DEFAULT_SETTINGS } from '../../src/renderer/components/SettingsModal';

describe('SettingsModal Functional Component', () => {
  it('does not render when isOpen is false', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<SettingsModal isOpen={false} onClose={onClose} onSave={onSave} />);

    expect(screen.queryByText('Settings')).toBeNull();
  });

  it('renders exactly the 4 navigation tabs and removed Graph and Keyboard', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <SettingsModal
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
        initialSettings={DEFAULT_SETTINGS}
      />
    );

    expect(screen.getByText('Settings')).toBeDefined();
    expect(screen.getByText('Providers')).toBeDefined();
    expect(screen.getByText('Agent')).toBeDefined();
    expect(screen.getByText('Appearance')).toBeDefined();
    expect(screen.getByText('General')).toBeDefined();

    // Graph and Keyboard should NOT be present
    expect(screen.queryByText('Graph')).toBeNull();
    expect(screen.queryByText('Keyboard')).toBeNull();
  });

  it('allows adding and entering API key for a provider in Providers tab', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <SettingsModal
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
        initialSettings={DEFAULT_SETTINGS}
      />
    );

    // Click + Add a provider
    const addRow = screen.getByText('+ Add a provider');
    fireEvent.click(addRow);

    // Search input appears
    const searchInput = screen.getByPlaceholderText('Search providers...');
    fireEvent.change(searchInput, { target: { value: 'DeepSeek' } });

    // Click DeepSeek
    fireEvent.click(screen.getByText('DeepSeek'));

    // Key input dialog appears
    expect(screen.getByText(/configurar chave de api: deepseek/i)).toBeDefined();
    const keyInput = screen.getByPlaceholderText(/insira sua chave/i);
    fireEvent.change(keyInput, { target: { value: 'sk-deepseek-123456789' } });

    // Click Salvar Chave de API
    const saveKeyBtn = screen.getByRole('button', { name: /salvar chave de api/i });
    fireEvent.click(saveKeyBtn);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'sk-deepseek-123456789',
        activeProviderId: 'deepseek',
        providers: expect.arrayContaining([
          expect.objectContaining({
            name: 'DeepSeek',
            apiKey: 'sk-deepseek-123456789',
          }),
        ]),
      })
    );
  });

  it('displays warning in Agent tab when no provider has an API key configured', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <SettingsModal
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
        initialSettings={{
          ...DEFAULT_SETTINGS,
          apiKey: '',
          providers: [],
        }}
      />
    );

    // Navigate to Agent tab
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }));

    // Warning should be displayed
    expect(screen.getByText(/nenhum provedor configurado com chave de api/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /ir para a aba providers/i })).toBeDefined();
  });

  it('allows searching and selecting models and choosing effort level in Agent tab', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <SettingsModal
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
        initialSettings={{
          ...DEFAULT_SETTINGS,
          activeProviderId: 'openrouter',
          providers: [
            {
              id: 'openrouter',
              name: 'OpenRouter',
              keyMasked: '...4591 • 73',
              apiKey: 'sk-or-real-key-1234',
              isActive: true,
            },
          ],
        }}
      />
    );

    // Navigate to Agent tab
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }));

    // Should indicate OpenRouter is active
    expect(screen.getByText('OpenRouter')).toBeDefined();

    // Click the model selection button for Strong (initially 'free')
    const strongModelBtn = screen.getByText('free');
    fireEvent.click(strongModelBtn);

    // Search input appears in the popover
    const searchModelInput = screen.getByPlaceholderText('Search models...');
    fireEvent.change(searchModelInput, { target: { value: 'Claude 3.7' } });

    // Select Claude 3.7 Sonnet
    const claudeOption = screen.getByText('Anthropic: Claude 3.7 Sonnet');
    fireEvent.click(claudeOption);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        strongModel: 'anthropic/claude-3.7-sonnet',
        model: 'anthropic/claude-3.7-sonnet',
        strongThinking: 'high',
      })
    );

    // Click effort level button for Strong
    const effortBtn = screen.getAllByRole('button', { name: /high/i })[0];
    fireEvent.click(effortBtn);

    // Effort popover opens with options (off, minimal, low, medium, high)
    const mediumOption = screen.getByText('medium');
    fireEvent.click(mediumOption);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        strongThinking: 'medium',
        thinkingLevel: 'Medium',
      })
    );
  });

  it('shows "Em Breve" in Appearance tab', () => {
    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        initialSettings={DEFAULT_SETTINGS}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
    expect(screen.getByText(/personalização de aparência \(em breve\)/i)).toBeDefined();
  });
});
