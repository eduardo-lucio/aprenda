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
- Inclua em "agentThinking" o seu monólogo interno autêntico em primeira pessoa (fluxo de consciência pedagógico) analisando o tema pedido pelo estudante, quais subáreas críticas precisam ser destrinchadas e por que escolheu esses 3 recortes.
- Responda EXCLUSIVAMENTE em formato JSON:
{
  "agentThinking": "Monólogo interno do agente em primeira pessoa analisando o tema e planejando os recortes...",
  "options": ["Recorte temático 1", "Recorte temático 2", "Recorte temático 3"]
}`;

  const prompt = `Tema de estudo: "${goal}"\nGere seu raciocínio interno e os 3 recortes de escopo temático específicos em JSON:`;
  return { systemPrompt, prompt };
}

export function buildGraphPrompt(goal: string): { systemPrompt: string; prompt: string } {
  const systemPrompt = `Você é o arquiteto curricular do APRENDA.
Sua tarefa é decompor o objetivo de estudo em um GRAFO ACÍCLICO DIRIGIDO (DAG) de dependências conceituais (de 6 a 8 nós objetivos, níveis 1 a 4) em ordem crescente de dificuldade E formular a PRIMEIRA questão diagnóstica para o conceito FUNDAMENTAL DE BASE (Nível 1) gerado.

Regras do DAG:
- 6 a 8 nós essenciais ao tema, organizados dos conceitos mais fundamentais e básicos (Nível 1) até a síntese avançada (Nível 4).
- "id": slug curto kebab-case (ex: "integral-definida").
- "level": 1 (fundamento raiz / base essencial) a 4 (síntese mais avançada).
- "prerequisites": lista de ids de nós de nível MENOR dos quais depende diretamente. Nós de nível 1 têm [].
- "summary": 1 frase direta e técnica.
- "unconditionalTruth": 1 frase com o princípio fundamental.

Regras da primeira questão ("firstQuestion"):
- Alvo: o nó de NÍVEL 1 (base fundamental) gerado no DAG ("nodeId"), para verificar primeiro se o estudante compreende a base essencial antes de avançar para níveis maiores.
- "questionText": enunciado claro e contextualizado sobre o fundamento básico (Nível 1), acessível para diagnosticar a base conceitual.
- "options": exatamente 4 alternativas completas e plausíveis (apenas 1 correta).
- "correctOptionIndex": índice numérico (0 a 3) da correta.
- "anchorConcept": título do conceito.
- "difficulty": 1.
- "agentThinking": seu monólogo interno autêntico em primeira pessoa (fluxo de consciência do tutor) explicando como estruturou a progressão do básico ao avançado e por que escolheu iniciar a sondagem validando este fundamento de base (Nível 1).

${LANG_RULE}
Responda SOMENTE em JSON no formato:
{
  "discipline": "nome curto",
  "agentThinking": "Monólogo interno em primeira pessoa planejando o grafo do básico ao avançado e o motivo de iniciar a sondagem pela base...",
  "nodes": [
    {
      "id": "slug-base",
      "title": "Título",
      "summary": "Resumo",
      "level": 1,
      "prerequisites": [],
      "unconditionalTruth": "Verdade incondicional"
    }
  ],
  "firstQuestion": {
    "nodeId": "slug-base",
    "questionText": "Enunciado contextualizado sobre o fundamento de base...",
    "options": ["A", "B", "C", "D"],
    "correctOptionIndex": 0,
    "anchorConcept": "Título",
    "difficulty": 1,
    "agentThinking": "Monólogo interno sobre o que esta primeira pergunta de base vai testar..."
  }
}`;

  const prompt = `Objetivo de estudo: "${goal}"\nGere o grafo em ordem crescente (Nível 1 a 4), seu monólogo interno e a primeira questão de Nível 1 em JSON:`;
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
- Inclua em "agentThinking" o seu monólogo interno autêntico em primeira pessoa (fluxo de consciência de tutor) deliberando sobre o que ainda precisa ser testado no conhecimento do estudante, por que está formulando essa pergunta específica sobre "${node.title}" e quais confusões as alternativas falsas vão capturar.
${LANG_RULE}
Responda SOMENTE em JSON:
{
  "agentThinking": "Monólogo interno em primeira pessoa deliberando sobre o que testar a seguir e como desenhar a pergunta...",
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
Gere a questão e seu monólogo interno em JSON:`;

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
