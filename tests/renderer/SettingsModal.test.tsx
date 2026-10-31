import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsModal, DEFAULT_SETTINGS } from '../../src/renderer/components/SettingsModal';

describe('SettingsModal Component', () => {
  it('does not render when isOpen is false', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<SettingsModal isOpen={false} onClose={onClose} onSave={onSave} />);

    expect(screen.queryByText('Configurações do Agente & LLM')).toBeNull();
  });

  it('renders settings fields and allows changing model and saving', () => {
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

    expect(screen.getByText('Configurações do Agente & LLM')).toBeDefined();

    // Select deepseek-r1 preset
    const deepseekBtn = screen.getByRole('button', { name: 'deepseek-r1' });
    fireEvent.click(deepseekBtn);

    // Click Salvar
    const saveBtn = screen.getByRole('button', { name: /salvar configurações/i });
    fireEvent.click(saveBtn);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'deepseek-r1',
      })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('tests connectivity when clicking test connection button', async () => {
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

    const testBtn = screen.getByRole('button', { name: /testar conexão/i });
    fireEvent.click(testBtn);

    expect(await screen.findByText(/conectado|estabelecida|configurado/i)).toBeDefined();
  });
});
