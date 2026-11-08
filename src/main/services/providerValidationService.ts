import { localize } from './llmClient';
import { ModelOption } from '../../shared/types';
import { fetchWithTimeout } from './http';

/** Providers validated by the generic OpenAI-compatible path below. */
const COMPATIBLE_PROVIDER_NAMES: Record<string, string> = {
  cerebras: 'Cerebras',
  together: 'Together AI',
  mistral: 'Mistral AI',
  custom: 'Custom endpoint',
};

export interface ProviderValidationResult {
  isValid: boolean;
  providerId: string;
  providerName: string;
  keyMasked: string;
  models: ModelOption[];
  error?: string;
}

export async function validateAndFetchModels(params: {
  providerId: string;
  apiKey: string;
  baseUrl?: string;
}): Promise<ProviderValidationResult> {
  const { providerId, apiKey } = params;
  const keyTrimmed = apiKey.trim();

  if (!keyTrimmed && providerId !== 'ollama' && providerId !== 'custom') {
    throw new Error(localize('A Chave de API não pode estar em branco.', 'The API key cannot be blank.'));
  }

  const masked =
    keyTrimmed.length > 8
      ? `...${keyTrimmed.slice(-4)} • ${keyTrimmed.length}`
      : keyTrimmed
      ? 'Configurada'
      : 'Local';

  // 1. OPENROUTER
  if (providerId === 'openrouter') {
    // 1a. Validate key against OpenRouter auth endpoint
    const authRes = await fetchWithTimeout('https://openrouter.ai/api/v1/auth/key', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${keyTrimmed}`,
      },
    });

    if (!authRes.ok) {
      let errorMsg = `HTTP ${authRes.status}`;
      try {
        const errJson: any = await authRes.json();
        errorMsg = errJson?.error?.message || errJson?.message || errorMsg;
      } catch {}
      throw new Error(localize(`Chave OpenRouter inválida: ${errorMsg} (Erro ${authRes.status})`, `Invalid OpenRouter key: ${errorMsg} (Error ${authRes.status})`));
    }

    // 1b. Fetch real live models from OpenRouter
    const modelsRes = await fetchWithTimeout('https://openrouter.ai/api/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${keyTrimmed}`,
      },
    });

    if (!modelsRes.ok) {
      throw new Error(localize(`Falha ao buscar modelos do OpenRouter: HTTP ${modelsRes.status}`, `Could not fetch OpenRouter models: HTTP ${modelsRes.status}`));
    }

    const modelsData: any = await modelsRes.json();
    const rawList: any[] = modelsData?.data || [];

    const models: ModelOption[] = rawList.map((m: any) => {
      const lower = m.id.toLowerCase();
      const isReasoning =
        lower.includes('r1') ||
        lower.includes('reason') ||
        lower.includes('thinking') ||
        lower.includes('o1') ||
        lower.includes('o3') ||
        lower.includes('3.7') ||
        lower.includes('3-7') ||
        lower.includes('qwq');

      let priceStr = 'Free';
      if (m.pricing) {
        const promptPrice = parseFloat(m.pricing.prompt || '0') * 1000000;
        const compPrice = parseFloat(m.pricing.completion || '0') * 1000000;
        if (promptPrice > 0 || compPrice > 0) {
          priceStr = `$${promptPrice.toFixed(2)}/$${compPrice.toFixed(2)}`;
        }
      }

      const contextStr = m.context_length
        ? `${Math.round(m.context_length / 1000)}k`
        : '128k';

      return {
        id: m.id,
        name: m.name || m.id,
        provider: 'openrouter',
        slug: `~${m.id}`,
        price: priceStr,
        context: contextStr,
        defaultEffort: isReasoning ? 'high' : 'medium',
        isReasoning,
      };
    });

    return {
      isValid: true,
      providerId: 'openrouter',
      providerName: 'OpenRouter',
      keyMasked: masked,
      models,
    };
  }

  // 2. OPENAI
  if (providerId === 'openai') {
    const res = await fetchWithTimeout('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${keyTrimmed}`,
      },
    });

    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}`;
      try {
        const errJson: any = await res.json();
        errorMsg = errJson?.error?.message || errorMsg;
      } catch {}
      throw new Error(localize(`Chave OpenAI inválida: ${errorMsg} (Erro ${res.status})`, `Invalid OpenAI key: ${errorMsg} (Error ${res.status})`));
    }

    const data: any = await res.json();
    const rawList: any[] = data?.data || [];

    // Filter to chat & reasoning models
    const chatModels = rawList.filter(
      (m: any) =>
        m.id.startsWith('gpt-') ||
        m.id.startsWith('o1') ||
        m.id.startsWith('o3') ||
        m.id.startsWith('chatgpt-')
    );

    const models: ModelOption[] = (chatModels.length > 0 ? chatModels : rawList).map((m: any) => {
      const isReasoning = m.id.startsWith('o1') || m.id.startsWith('o3');
      return {
        id: m.id,
        name: `OpenAI: ${m.id}`,
        provider: 'openai',
        slug: m.id,
        price: isReasoning ? 'Reasoning' : 'Standard',
        context: isReasoning ? '200k' : '128k',
        defaultEffort: isReasoning ? 'high' : 'medium',
        isReasoning,
      };
    });

    return {
      isValid: true,
      providerId: 'openai',
      providerName: 'OpenAI',
      keyMasked: masked,
      models,
    };
  }

  // 3. GOOGLE GEMINI
  if (providerId === 'google') {
    const res = await fetchWithTimeout(
      'https://generativelanguage.googleapis.com/v1beta/models',
      {
        method: 'GET',
        headers: { 'x-goog-api-key': keyTrimmed },
      }
    );

    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}`;
      try {
        const errJson: any = await res.json();
        errorMsg = errJson?.error?.message || errorMsg;
      } catch {}
      throw new Error(localize(`Chave Google Gemini inválida: ${errorMsg} (Erro ${res.status})`, `Invalid Google Gemini key: ${errorMsg} (Error ${res.status})`));
    }

    const data: any = await res.json();
    const rawList: any[] = data?.models || [];

    const generateModels = rawList.filter(
      (m: any) =>
        !m.supportedGenerationMethods ||
        m.supportedGenerationMethods.includes('generateContent')
    );

    const models: ModelOption[] = generateModels.map((m: any) => {
      const cleanId = m.name.replace(/^models\//, '');
      const isReasoning = cleanId.includes('thinking') || cleanId.includes('pro');
      const ctx = m.inputTokenLimit ? `${Math.round(m.inputTokenLimit / 1000)}k` : '1M';

      return {
        id: cleanId,
        name: `Google: ${m.displayName || cleanId}`,
        provider: 'google',
        slug: cleanId,
        price: cleanId.includes('flash') ? 'Free/Fast' : 'Pro Tier',
        context: ctx,
        defaultEffort: isReasoning ? 'high' : 'medium',
        isReasoning,
      };
    });

    return {
      isValid: true,
      providerId: 'google',
      providerName: 'Google Gemini',
      keyMasked: masked,
      models,
    };
  }

  // 4. DEEPSEEK
  if (providerId === 'deepseek') {
    const res = await fetchWithTimeout('https://api.deepseek.com/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${keyTrimmed}`,
      },
    });

    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}`;
      try {
        const errJson: any = await res.json();
        errorMsg = errJson?.error?.message || errJson?.message || errorMsg;
      } catch {}
      throw new Error(localize(`Chave DeepSeek inválida: ${errorMsg} (Erro ${res.status})`, `Invalid DeepSeek key: ${errorMsg} (Error ${res.status})`));
    }

    const data: any = await res.json();
    const rawList: any[] = data?.data || [
      { id: 'deepseek-chat' },
      { id: 'deepseek-reasoner' },
    ];

    const models: ModelOption[] = rawList.map((m: any) => {
      const isReasoning = m.id.includes('reasoner') || m.id.includes('r1');
      return {
        id: m.id,
        name: isReasoning ? 'DeepSeek: DeepSeek-R1 (Reasoner)' : 'DeepSeek: DeepSeek-V3',
        provider: 'deepseek',
        slug: m.id,
        price: isReasoning ? '$0.55/$2.19' : '$0.14/$0.28',
        context: '64k',
        defaultEffort: isReasoning ? 'high' : 'low',
        isReasoning,
      };
    });

    return {
      isValid: true,
      providerId: 'deepseek',
      providerName: 'DeepSeek',
      keyMasked: masked,
      models,
    };
  }

  // 5. GROQ
  if (providerId === 'groq') {
    const res = await fetchWithTimeout('https://api.groq.com/openai/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${keyTrimmed}`,
      },
    });

    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}`;
      try {
        const errJson: any = await res.json();
        errorMsg = errJson?.error?.message || errorMsg;
      } catch {}
      throw new Error(localize(`Chave Groq inválida: ${errorMsg} (Erro ${res.status})`, `Invalid Groq key: ${errorMsg} (Error ${res.status})`));
    }

    const data: any = await res.json();
    const rawList: any[] = data?.data || [];

    const models: ModelOption[] = rawList.map((m: any) => {
      const isReasoning = m.id.includes('r1') || m.id.includes('reason');
      return {
        id: m.id,
        name: `Groq: ${m.id}`,
        provider: 'groq',
        slug: m.id,
        price: 'Ultra-Fast',
        context: m.context_window ? `${Math.round(m.context_window / 1000)}k` : '128k',
        defaultEffort: isReasoning ? 'high' : 'medium',
        isReasoning,
      };
    });

    return {
      isValid: true,
      providerId: 'groq',
      providerName: 'Groq',
      keyMasked: masked,
      models,
    };
  }

  // 6. ANTHROPIC
  if (providerId === 'anthropic') {
    const res = await fetchWithTimeout('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'x-api-key': keyTrimmed,
        'anthropic-version': '2023-06-01',
      },
    });

    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}`;
      try {
        const errJson: any = await res.json();
        errorMsg = errJson?.error?.message || errJson?.message || errorMsg;
      } catch {}
      throw new Error(localize(`Chave Anthropic inválida: ${errorMsg} (Erro ${res.status})`, `Invalid Anthropic key: ${errorMsg} (Error ${res.status})`));
    }

    const data: any = await res.json();
    const rawList: any[] = data?.data || [];

    const models: ModelOption[] = rawList.map((m: any) => {
      const isReasoning = m.id.includes('3-7') || m.id.includes('thinking');
      return {
        id: m.id,
        name: `Anthropic: ${m.display_name || m.id}`,
        provider: 'anthropic',
        slug: m.id,
        price: isReasoning ? '$3.00/$15.00' : '$0.80/$4.00',
        context: '200k',
        defaultEffort: isReasoning ? 'high' : 'low',
        isReasoning,
      };
    });

    return {
      isValid: true,
      providerId: 'anthropic',
      providerName: 'Anthropic',
      keyMasked: masked,
      models,
    };
  }

  // 7. OLLAMA (Local)
  if (providerId === 'ollama') {
    const url = (params.baseUrl || 'http://localhost:11434').replace(/\/+$/, '').replace(/\/v1$/, '');
    let res: Response;
    try {
      res = await fetchWithTimeout(`${url}/api/tags`);
    } catch (e: any) {
      throw new Error(localize(`Não foi possível conectar ao Ollama em ${url}: ${e?.message || 'Servidor inacessível'}`, `Could not reach Ollama at ${url}: ${e?.message || 'server unreachable'}`));
    }

    if (!res.ok) {
      throw new Error(localize(`Ollama respondeu com erro HTTP ${res.status}`, `Ollama answered with HTTP error ${res.status}`));
    }

    const data: any = await res.json();
    const rawList: any[] = data?.models || [];

    if (rawList.length === 0) {
      throw new Error(
        localize(`Conexão com Ollama bem-sucedida, mas nenhum modelo foi encontrado instalado. Execute 'ollama pull <modelo>' no terminal.`, `Connected to Ollama, but no model is installed. Run 'ollama pull <model>' in a terminal.`)
      );
    }

    const models: ModelOption[] = rawList.map((m: any) => {
      const isReasoning = m.name.includes('r1') || m.name.includes('reason');
      return {
        id: m.name,
        name: `Ollama: ${m.name}`,
        provider: 'ollama',
        slug: m.name,
        price: 'Local GPU/CPU',
        context: '128k',
        defaultEffort: isReasoning ? 'high' : 'medium',
        isReasoning,
      };
    });

    return {
      isValid: true,
      providerId: 'ollama',
      providerName: 'Ollama (Local)',
      keyMasked: 'Local',
      models,
    };
  }

  // 7. CUSTOM / OTHER OPENAI-COMPATIBLE ENDPOINTS
  const targetBaseUrl = (params.baseUrl || 'http://localhost:8000/v1').replace(/\/+$/, '');
  const modelsUrl = targetBaseUrl.endsWith('/models') ? targetBaseUrl : `${targetBaseUrl}/models`;

  const customRes = await fetchWithTimeout(modelsUrl, {
    method: 'GET',
    headers: keyTrimmed ? { Authorization: `Bearer ${keyTrimmed}` } : {},
  });

  if (!customRes.ok) {
    let errorMsg = `HTTP ${customRes.status}`;
    try {
      const errJson: any = await customRes.json();
      errorMsg = errJson?.error?.message || errJson?.message || errorMsg;
    } catch {}
    throw new Error(localize(`Endpoint customizado (${modelsUrl}) rejeitou a chave: ${errorMsg}`, `The custom endpoint (${modelsUrl}) rejected the key: ${errorMsg}`));
  }

  const customData: any = await customRes.json();
  const rawList: any[] = (Array.isArray(customData) ? customData : customData?.data || customData?.models || []).filter(
    (m: any) => m?.id || m?.name
  );
  if (rawList.length === 0) {
    throw new Error(
      localize(`${modelsUrl} respondeu, mas não devolveu uma lista de modelos que o APRENDA reconheça. Confira o endereço.`, `${modelsUrl} answered, but not with a model list APRENDA recognizes. Check the address.`)
    );
  }

  const models: ModelOption[] = rawList.map((m: any) => {
    const id = m.id || m.name;
    return {
      id,
      name: `Custom: ${id}`,
      provider: providerId,
      slug: id,
      price: 'Custom',
      context: '128k',
      defaultEffort: 'medium',
    };
  });

  return {
    isValid: true,
    providerId,
    providerName: COMPATIBLE_PROVIDER_NAMES[providerId] || providerId,
    keyMasked: masked,
    models,
  };
}
