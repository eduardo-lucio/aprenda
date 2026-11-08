import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsModal, DEFAULT_SETTINGS } from '../../src/renderer/components/SettingsModal';
import { ModelOption } from '../../src/shared/types';
import { validateAndFetchModels } from '../../src/main/services/providerValidationService';
import { validateDeepgramKey } from '../../src/main/services/speechService';

describe('SettingsModal Functional Component', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    // The modal validates keys through the main process (IPC); in tests the real services run behind a fake bridge
    (window as any).api = {
      validateProvider: (params: any) => validateAndFetchModels(params),
      validateDeepgramKey: (key: string) => validateDeepgramKey(key),
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('does not render when isOpen is false', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<SettingsModal isOpen={false} onClose={onClose} onSave={onSave} />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders only the real tabs (Provedores, Modelo, Geral) and none of the placeholder ones', () => {
    render(<SettingsModal isOpen={true} onClose={vi.fn()} onSave={vi.fn()} initialSettings={DEFAULT_SETTINGS} />);

    expect(screen.getByRole('dialog', { name: 'Configurações' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Provedores' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Modelo' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Geral' })).toBeDefined();

    // Removed: placeholder Appearance tab and fake update checker
    expect(screen.queryByText(/appearance|aparência/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Geral' }));
    expect(screen.queryByText(/update|atualiza/i)).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Idioma' })).toBeDefined();
  });

  it('saves the interface language chosen in Geral', () => {
    const onSave = vi.fn();
    render(<SettingsModal isOpen={true} onClose={vi.fn()} onSave={onSave} initialSettings={DEFAULT_SETTINGS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Geral' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Idioma' }), { target: { value: 'en' } });
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ language: 'en' }));
  });

  it('rejects invalid API key with error banner and DOES NOT save or activate provider', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    // Mock failure (401 Unauthorized)
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        error: { message: 'User not found.', code: 401 },
      }),
    } as any);

    render(
      <SettingsModal
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
        initialSettings={DEFAULT_SETTINGS}
      />
    );

    // Click + Add a provider
    fireEvent.click(screen.getByText('+ Adicionar provedor'));

    // Search input appears
    const searchInput = screen.getByPlaceholderText('Buscar provedores…');
    fireEvent.change(searchInput, { target: { value: 'OpenRouter' } });

    // Click OpenRouter
    fireEvent.click(screen.getByText('OpenRouter'));

    // Type a fake/garbage API key
    const keyInput = screen.getByPlaceholderText(/cole sua chave/i);
    fireEvent.change(keyInput, { target: { value: 'sk-or-invalid-garbage-123' } });

    // Click Salvar Chave de API
    const saveKeyBtn = screen.getByRole('button', { name: /salvar chave de api/i });
    fireEvent.click(saveKeyBtn);

    // Wait for error banner to appear
    await waitFor(() => {
      expect(screen.getByText(/a chave não foi aceita/i)).toBeDefined();
      expect(screen.getByText(/user not found/i)).toBeDefined();
    });

    // onSave should NOT be called!
    expect(onSave).not.toHaveBeenCalled();
  });

  it('validates key and dynamically saves provider with real models upon successful validation', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    // Mock successful OpenRouter key check + models response
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { label: 'Eduardo Key' } }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: 'anthropic/claude-3.7-sonnet',
              name: 'Claude 3.7 Sonnet',
              context_length: 200000,
              pricing: { prompt: '0.000003', completion: '0.000015' },
            },
            {
              id: 'deepseek/deepseek-r1',
              name: 'DeepSeek R1',
              context_length: 64000,
              pricing: { prompt: '0.00000055', completion: '0.00000219' },
            },
          ],
        }),
      } as any);

    render(
      <SettingsModal
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
        initialSettings={DEFAULT_SETTINGS}
      />
    );

    // Click + Add a provider
    fireEvent.click(screen.getByText('+ Adicionar provedor'));

    // Select OpenRouter
    fireEvent.click(screen.getByText('OpenRouter'));

    // Type real key
    const keyInput = screen.getByPlaceholderText(/cole sua chave/i);
    fireEvent.change(keyInput, { target: { value: 'sk-or-v1-valid-key-9876543210' } });

    // Click Salvar Chave de API
    const saveKeyBtn = screen.getByRole('button', { name: /salvar chave de api/i });
    fireEvent.click(saveKeyBtn);

    // Wait for successful save
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          activeProviderId: 'openrouter',
          // S1: the key stays in the main process, never in the saved settings
          apiKey: '',
          providers: expect.arrayContaining([
            expect.objectContaining({
              id: 'openrouter',
              isValidated: true,
              models: expect.arrayContaining([
                expect.objectContaining({ id: 'anthropic/claude-3.7-sonnet' }),
                expect.objectContaining({ id: 'deepseek/deepseek-r1' }),
              ]),
            }),
          ]),
        })
      );
    });
  });

  it('displays warning in Modelo tab when no provider is validated', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <SettingsModal
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
        initialSettings={{
          ...DEFAULT_SETTINGS,
          activeProviderId: '',
          providers: [],
        }}
      />
    );

    // Navigate to Agent tab
    fireEvent.click(screen.getByRole('button', { name: 'Modelo' }));

    // Warning should be displayed
    expect(screen.getByText(/nenhum provedor configurado com chave de api/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /ir para provedores/i })).toBeDefined();
  });

  it('allows searching and selecting models from the live provider models and choosing effort level', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    const realModels: ModelOption[] = [
      {
        id: 'anthropic/claude-3.7-sonnet',
        name: 'Anthropic: Claude 3.7 Sonnet',
        provider: 'openrouter',
        slug: '~anthropic/claude-3.7-sonnet',
        price: '$3.00/$15.00',
        context: '200k',
        defaultEffort: 'high',
        isReasoning: true,
      },
      {
        id: 'deepseek/deepseek-r1',
        name: 'DeepSeek: DeepSeek-R1',
        provider: 'openrouter',
        slug: '~deepseek/deepseek-r1',
        price: '$0.55/$2.19',
        context: '64k',
        defaultEffort: 'high',
        isReasoning: true,
      },
      {
        id: 'google/gemini-2.0-flash',
        name: 'Google: Gemini 2.0 Flash',
        provider: 'openrouter',
        slug: '~google/gemini-2.0-flash',
        price: '$0.10/$0.40',
        context: '1M',
        defaultEffort: 'medium',
      },
    ];

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
              keyMasked: '...3210 • 30',
              apiKey: 'sk-or-v1-validated-key',
              isActive: true,
              isValidated: true,
              models: realModels,
            },
          ],
          strongModel: 'deepseek/deepseek-r1',
          strongThinking: 'high',
        }}
      />
    );

    // Navigate to Agent tab
    fireEvent.click(screen.getByRole('button', { name: 'Modelo' }));

    // Should indicate OpenRouter is active with real models count
    expect(screen.getByText('OpenRouter')).toBeDefined();
    expect(screen.getByText(/\(3 modelos\)/i)).toBeDefined();

    // Click the model selection button for Strong (current: 'deepseek/deepseek-r1')
    const strongModelBtn = screen.getByText('deepseek/deepseek-r1');
    fireEvent.click(strongModelBtn);

    // Search input appears in the popover
    const searchModelInput = screen.getByPlaceholderText('Buscar modelos…');
    fireEvent.change(searchModelInput, { target: { value: 'Claude 3.7' } });

    // Select Claude 3.7 Sonnet from the filtered real models
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

  it('allows validating Deepgram API key and selecting voice language in Providers tab', async () => {
    const onSave = vi.fn();
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ projects: [] }),
    } as any);

    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        onSave={onSave}
        initialSettings={DEFAULT_SETTINGS}
      />
    );

    const dgInput = screen.getByPlaceholderText(/chave do deepgram/i);
    fireEvent.change(dgInput, { target: { value: 'dg-secret-key-123456789' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar deepgram/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          deepgramApiKey: '',
          deepgramValidated: true,
        })
      );
    });

    // Change voice language via checkbox
    const englishCheckbox = screen.getByLabelText('English (US)');
    fireEvent.click(englishCheckbox);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        voiceLanguage: 'en-US',
      })
    );
  });

  it('lets the user set the minimum probe questions between 3 and 20 in the Modelo tab', () => {
    const onSave = vi.fn();
    render(<SettingsModal isOpen={true} onClose={vi.fn()} onSave={onSave} initialSettings={DEFAULT_SETTINGS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Modelo' }));

    const slider = screen.getByRole('slider', { name: /mínimo de perguntas do diagnóstico/i }) as HTMLInputElement;
    expect(slider.min).toBe('3');
    expect(slider.max).toBe('20');
    expect(screen.getByTestId('min-questions-value').textContent).toBe('8');

    fireEvent.change(slider, { target: { value: '12' } });
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ minQuestions: 12 }));
    expect(screen.getByTestId('min-questions-value').textContent).toBe('12');
  });
});
describe('SettingsModal providers', () => {
  const model = (id: string, defaultEffort: ModelOption['defaultEffort'] = 'medium'): ModelOption => ({
    id, name: id, provider: 'p', slug: id, price: 'Free', context: '1k', defaultEffort,
  });
  const provider = (id: string, name: string, models: ModelOption[], over = {}) => ({
    id, name, keyMasked: '...1234', apiKey: `key-${id}`, isValidated: true, models, ...over,
  });
  const base = {
    ...DEFAULT_SETTINGS,
    activeProviderId: 'a',
    strongModel: 'a-1',
    model: 'a-1',
    providers: [provider('a', 'Prov A', [model('a-1')], { isActive: true }), provider('b', 'Prov B', [model('b-1', 'high')])],
  };

  it('F8: adding another provider switches to its default model', async () => {
    (window as any).api = {
      validateProvider: async () => ({ isValid: true, providerId: 'groq', providerName: 'Groq', keyMasked: 'x', models: [model('groq-1')] }),
    };
    const onSave = vi.fn();
    render(<SettingsModal isOpen onClose={vi.fn()} onSave={onSave} initialSettings={base} />);
    fireEvent.click(screen.getByText('+ Adicionar provedor'));
    fireEvent.click(screen.getByText('Groq'));
    fireEvent.change(document.querySelector('input[type=password]')!, { target: { value: 'segredo-muito-longo' } });
    fireEvent.click(screen.getByText('Salvar chave de API'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ activeProviderId: 'groq', strongModel: 'groq-1', model: 'groq-1' })));
  });

  it('I5: a saved provider can be activated without validating again', () => {
    (window as any).api = { validateProvider: vi.fn() };
    const onSave = vi.fn();
    render(<SettingsModal isOpen onClose={vi.fn()} onSave={onSave} initialSettings={base} />);
    fireEvent.click(screen.getByRole('button', { name: /ativar prov b/i }));
    expect((window as any).api.validateProvider).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeProviderId: 'b', strongModel: 'b-1', model: 'b-1', strongThinking: 'high' })
    );
  });

  it('I5: removing an inactive provider keeps the active one', () => {
    const onSave = vi.fn();
    render(<SettingsModal isOpen onClose={vi.fn()} onSave={onSave} initialSettings={{ ...base, activeProviderId: 'b', strongModel: 'b-1' }} />);
    fireEvent.click(screen.getAllByText('remover')[0]);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('confirmar?'));
    const saved = onSave.mock.calls[onSave.mock.calls.length - 1][0];
    expect(saved.activeProviderId).toBe('b');
    expect(saved.providers.map((p: any) => p.id)).toEqual(['b']);
  });

  it('F14: a validated Ollama counts as configured in the Model tab', () => {
    render(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        onSave={vi.fn()}
        initialSettings={{ ...DEFAULT_SETTINGS, activeProviderId: 'ollama', providers: [provider('ollama', 'Ollama', [model('llama')], { apiKey: '' })] }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Modelo' }));
    expect(screen.queryByText(/nenhum provedor configurado/i)).toBeNull();
  });

  it('I3: offers the same effort levels as the chat selector', () => {
    render(<SettingsModal isOpen onClose={vi.fn()} onSave={vi.fn()} initialSettings={base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Modelo' }));
    fireEvent.click(screen.getAllByRole('button', { name: /high/i })[0]);
    expect(screen.queryByText('minimal')).toBeNull();
    expect(screen.getByText('medium')).toBeDefined();
  });
});
