import { ConceptNode, QuestionData } from '../../shared/types';

const LANG_RULE = 'Escreva em português do Brasil com precisão técnica universitária e extrema concisão.';

export function buildGoalOptionsPrompt(goal: string): { systemPrompt: string; prompt: string } {
  const systemPrompt = `Você é o orientador pedagógico do APRENDA.
O estudante definiu o objetivo de estudo: "${goal}".
Sua tarefa é propor exatamente 3 recortes temáticos objetivos, técnicos e distintos para guiar a sondagem diagnóstica.
Regras OBRIGATÓRIAS:
- Proibido usar clichês genéricos como "Domínio completo de...", "Fundamentos e pré-requisitos de...", ou "Aplicações práticas de...".
- Cada opção deve ser um recorte técnico, conceitual ou aplicado CONCRETO, diretamente relacionado a "${goal}".
- Cada opção deve ter entre 4 e 10 palavras, escrita em português do Brasil com precisão técnica.
- Responda EXCLUSIVAMENTE em formato JSON:
{"options": ["Recorte temático 1", "Recorte temático 2", "Recorte temático 3"]}`;

  const prompt = `Tema de estudo: "${goal}"\nGere os 3 recortes de escopo temático específicos em JSON:`;
  return { systemPrompt, prompt };
}

export function buildGraphPrompt(goal: string): { systemPrompt: string; prompt: string } {
  const systemPrompt = `Você é o arquiteto curricular do APRENDA.
Sua tarefa é decompor o objetivo de estudo em um GRAFO ACÍCLICO DIRIGIDO (DAG) de dependências conceituais (de 6 a 8 nós objetivos, níveis 1 a 4) E formular a PRIMEIRA questão diagnóstica para o conceito de nível mais alto gerado.

Regras do DAG:
- 6 a 8 nós essenciais ao tema.
- "id": slug curto kebab-case (ex: "integral-definida").
- "level": 1 (fundamento raiz) a 4 (síntese mais avançada).
- "prerequisites": lista de ids de nós de nível MENOR dos quais depende diretamente. Nós de nível 1 têm [].
- "summary": 1 frase direta e técnica.
- "unconditionalTruth": 1 frase com o princípio fundamental.

Regras da primeira questão ("firstQuestion"):
- Alvo: o nó de nível mais alto gerado no DAG ("nodeId").
- "questionText": enunciado prático contextualizado com um cenário ou problema real (não use fórmulas mecânicas genéricas).
- "options": exatamente 4 alternativas completas e plausíveis (apenas 1 correta).
- "correctOptionIndex": índice numérico (0 a 3) da correta.
- "anchorConcept": título do conceito.
- "difficulty": nível (1 a 4).

${LANG_RULE}
Responda SOMENTE em JSON no formato:
{
  "discipline": "nome curto",
  "nodes": [
    {
      "id": "slug",
      "title": "Título",
      "summary": "Resumo",
      "level": 1,
      "prerequisites": [],
      "unconditionalTruth": "Verdade incondicional"
    }
  ],
  "firstQuestion": {
    "nodeId": "slug-do-no-topo",
    "questionText": "Enunciado prático com problema real...",
    "options": ["A", "B", "C", "D"],
    "correctOptionIndex": 0,
    "anchorConcept": "Título",
    "difficulty": 4
  }
}`;

  const prompt = `Objetivo de estudo: "${goal}"\nGere o grafo e a primeira questão em JSON:`;
  return { systemPrompt, prompt };
}

export function buildProbeQuestionPrompt(
  node: ConceptNode,
  goal: string,
  previousQuestions: string[]
): { systemPrompt: string; prompt: string } {
  const systemPrompt = `Você é o Gerador Cirúrgico do APRENDA, especialista em elaborar questões diagnósticas de múltipla escolha para estudantes universitários.
Crie UMA questão prática, contextualizada e profunda focada no conceito indicado para diagnosticar a real compreensão do estudante.
Regras:
- O enunciado deve conter um problema prático, cenário de aplicação ou análise de caso (NÃO use perguntas genéricas como "qual alternativa expressa o princípio correto").
- Exatamente 4 alternativas homogêneas, bem escritas e plausíveis (apenas 1 correta).
- Embaralhe a alternativa correta ("correctOptionIndex" pode ser 0, 1, 2 ou 3).
- Distratores devem capturar equívocos comuns de estudantes universitários ou atalhos heurísticos falhos.
- Não repita perguntas anteriores.
${LANG_RULE}
Responda SOMENTE em JSON:
{
  "questionText": "Enunciado prático contextualizado...",
  "options": ["Opção 0", "Opção 1", "Opção 2", "Opção 3"],
  "correctOptionIndex": 0,
  "anchorConcept": "${node.title}",
  "difficulty": ${node.level || 2}
}`;

  const prompt = `Objetivo: "${goal}"
Conceito: ${node.title} (${node.id})
Resumo: ${node.summary}
Verdade Incondicional / Princípio: ${node.unconditionalTruth}
Nível: ${node.level}/4
${previousQuestions.length ? `Questões já aplicadas (evite repetição):\n- ${previousQuestions.slice(-4).join('\n- ')}` : ''}
Gere a questão em JSON:`;

  return { systemPrompt, prompt };
}

export function buildPredictPrompt(node: ConceptNode, goal: string): { systemPrompt: string; prompt: string } {
  const systemPrompt = `Você é o Professor Socrático do APRENDA.
Antes de ensinar um conceito, faça o estudante prever o comportamento a partir da intuição ("Como eu poderia ter deduzido isso?").
Pergunta curta (2 frases), baseada em situação concreta.
${LANG_RULE}
Responda SOMENTE em JSON: {"questionText": "...", "promptGoal": "instrução curta"}`;

  const prompt = `Objetivo: "${goal}"
Conceito: ${node.title}
Resumo: ${node.summary}
Verdade Incondicional: ${node.unconditionalTruth}
Gere a pergunta de previsão em JSON:`;

  return { systemPrompt, prompt };
}
