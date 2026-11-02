import { ConceptNode, QuestionData } from '../../shared/types';

const LANG_RULE = 'Escreva em português do Brasil com precisão técnica universitária e extrema concisão.';

export function buildGoalOptionsPrompt(goal: string): { systemPrompt: string; prompt: string } {
  const systemPrompt = `Você é o orientador do APRENDA.
Dado o objetivo de aprendizado do estudante, proponha exatamente 3 recortes de escopo distintos e objetivos para guiar a sondagem diagnóstica.
${LANG_RULE}
Responda SOMENTE em JSON: {"options": ["recorte 1", "recorte 2", "recorte 3"]}`;

  const prompt = `Objetivo: "${goal}"\nGere os 3 recortes em JSON:`;
  return { systemPrompt, prompt };
}

export function buildGraphPrompt(goal: string): { systemPrompt: string; prompt: string } {
  const systemPrompt = `Você é o arquiteto curricular do APRENDA.
Sua tarefa é decompor o objetivo em um GRAFO ACÍCLICO DIRIGIDO (DAG) de dependências conceituais (de 6 a 8 nós objetivos, níveis 1 a 4) E fornecer uma questão diagnóstica objetiva para CADA nó.

Regras do DAG:
- 6 a 8 nós essenciais ao tema.
- "id": slug curto kebab-case (ex: "integral-definida").
- "level": 1 (fundamento raiz) a 4 (síntese mais avançada).
- "prerequisites": lista de ids de nós de nível MENOR dos quais depende diretamente. Nós de nível 1 têm [].
- "summary": 1 frase direta.
- "unconditionalTruth": 1 frase com o princípio fundamental.
- "question": questão diagnóstica direta para este nó:
  - "questionText": pergunta prática direta e contextualizada (1 a 2 frases)
  - "options": exatamente 4 alternativas curtas (apenas 1 correta)
  - "correctOptionIndex": índice numérico (0 a 3) da alternativa correta

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
      "unconditionalTruth": "Verdade incondicional",
      "question": {
        "questionText": "Pergunta sobre este conceito?",
        "options": ["Opção correta", "Distrator 1", "Distrator 2", "Distrator 3"],
        "correctOptionIndex": 0
      }
    }
  ]
}`;

  const prompt = `Objetivo de estudo: "${goal}"\nGere o grafo com as questões diagnósticas em JSON:`;
  return { systemPrompt, prompt };
}

export function buildProbeQuestionPrompt(
  node: ConceptNode,
  goal: string,
  previousQuestions: string[]
): { systemPrompt: string; prompt: string } {
  const systemPrompt = `Você é o Gerador Cirúrgico do APRENDA.
Crie UMA questão de múltipla escolha focada no conceito indicado para diagnosticar a real compreensão do estudante.
Regras:
- 4 alternativas homogêneas e plausíveis (apenas 1 correta).
- Distratores devem capturar equívocos comuns.
- Não repita perguntas anteriores.
${LANG_RULE}
Responda SOMENTE em JSON:
{"questionText": "...", "options": ["...", "...", "...", "..."], "correctOptionIndex": 0, "anchorConcept": "...", "difficulty": 1}`;

  const prompt = `Objetivo: "${goal}"
Conceito: ${node.title} (${node.id})
Resumo: ${node.summary}
Verdade Incondicional: ${node.unconditionalTruth}
Nível: ${node.level}/4
${previousQuestions.length ? `Questões já aplicadas (não repita):\n- ${previousQuestions.slice(-4).join('\n- ')}` : ''}
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
