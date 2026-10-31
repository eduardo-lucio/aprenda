import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsModal, DEFAULT_SETTINGS } from '../../src/renderer/components/SettingsModal';

describe('SettingsModal Component', () => {
  it('does not render when isOpen is false', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<SettingsModal isOpen={false} onClose={onClose} onSave={onSave} />);

    expect(screen.queryByText('Settings')).toBeNull();
  });

  it('renders all 6 navigation tabs and allows navigating between them', () => {
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
    expect(screen.getByText('Graph')).toBeDefined();
    expect(screen.getByText('Keyboard')).toBeDefined();
    expect(screen.getByText('General')).toBeDefined();

    // Default active tab is Providers
    expect(screen.getByText('PROVIDERS')).toBeDefined();
    expect(screen.getByText('MODEL API KEYS')).toBeDefined();
    expect(screen.getByText('+ Add a provider')).toBeDefined();

    // Switch to Agent tab
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }));
    expect(screen.getByText('MODELS')).toBeDefined();
    expect(screen.getByText('Strong')).toBeDefined();
    expect(screen.getByText('The main model for your sessions')).toBeDefined();
    expect(screen.getByText('Quizzing')).toBeDefined();

    // Switch to Appearance tab
    fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
    expect(screen.getByText('APPEARANCE')).toBeDefined();
    expect(screen.getByText('Reading font')).toBeDefined();

    // Switch to Graph tab
    fireEvent.click(screen.getByRole('button', { name: 'Graph' }));
    expect(screen.getByText('GRAPH')).toBeDefined();
    expect(screen.getByText('Arrowhead markers')).toBeDefined();

    // Switch to Keyboard tab
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard' }));
    expect(screen.getByText('KEYBOARD SHORTCUTS')).toBeDefined();
    expect(screen.getByText('Toggle Voice Dictation')).toBeDefined();

    // Switch to General tab
    fireEvent.click(screen.getByRole('button', { name: 'General' }));
    expect(screen.getByText('GENERAL')).toBeDefined();
    expect(screen.getByText(/version 0.4.0/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /check for updates/i })).toBeDefined();
  });

  it('allows selecting provider from searchable dropdown in Providers tab', () => {
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
    expect(searchInput).toBeDefined();

    // Type to filter
    fireEvent.change(searchInput, { target: { value: 'Google' } });
    expect(screen.getByText('GEMINI_API_KEY')).toBeDefined();

    // Click Google
    fireEvent.click(screen.getByText('Google'));

    // Input key appears
    const keyInput = screen.getByPlaceholderText(/sk-... ou endpoint/i);
    fireEvent.change(keyInput, { target: { value: 'AIzaSyDemoKey123' } });

    // Save provider
    const saveBtn = screen.getByRole('button', { name: 'Salvar' });
    fireEvent.click(saveBtn);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({
            name: 'Google',
          }),
        ]),
      })
    );
  });

  it('updates Strong model in Agent tab and calls onSave', () => {
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

    // Navigate to Agent tab
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }));

    // Find strong model select
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'deepseek-r1' } });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        strongModel: 'deepseek-r1',
        model: 'deepseek-r1',
      })
    );
  });
});
