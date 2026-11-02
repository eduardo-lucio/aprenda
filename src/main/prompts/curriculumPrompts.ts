import { ConceptNode, QuestionData } from '../../shared/types';

const LANG_RULE = 'Escreva todo o conteúdo em português do Brasil, com rigor técnico de nível universitário.';

export function buildGoalOptionsPrompt(goal: string): { systemPrompt: string; prompt: string } {
  const systemPrompt = `Você é o orientador de escopo do APRENDA, um tutor socrático que diagnostica os limites de conhecimento de estudantes universitários em QUALQUER disciplina.
Dado o objetivo de aprendizado do estudante, proponha exatamente 3 recortes de escopo distintos e concretos para a sondagem diagnóstica (ex.: foco conceitual, foco em aplicação/cálculo, visão panorâmica dos fundamentos).
${LANG_RULE}
Responda SOMENTE em JSON: {"options": ["recorte 1", "recorte 2", "recorte 3"]}`;

  const prompt = `Objetivo do estudante: "${goal}"\nGere os 3 recortes em JSON:`;
  return { systemPrompt, prompt };
}

export function buildGraphPrompt(goal: string): { systemPrompt: string; prompt: string } {
  const systemPrompt = `Você é o arquiteto curricular do APRENDA. Sua tarefa é decompor um objetivo de aprendizado em um GRAFO ACÍCLICO DIRIGIDO (DAG) de dependências conceituais, do mais fundamental (nível 1) ao mais avançado (nível 4).
Regras:
- Gere entre 8 e 12 conceitos (nós), todos estritamente relevantes ao objetivo.
- "id": slug curto em kebab-case, único, sem acentos (ex.: "derivada-cadeia").
- "level": inteiro de 1 a 4 (1 = pré-requisitos fundamentais, 4 = o alvo mais avançado do objetivo). Use todos os níveis.
- "prerequisites": lista de ids de nós de nível MENOR dos quais este conceito depende diretamente. Nós de nível 1 têm lista vazia.
- "summary": 1 frase descrevendo o conceito.
- "unconditionalTruth": a verdade incondicional/princípio central do conceito, enunciada com precisão em 1 frase.
${LANG_RULE}
Responda SOMENTE em JSON:
{"discipline": "nome curto da disciplina", "nodes": [{"id": "...", "title": "...", "summary": "...", "level": 1, "prerequisites": [], "unconditionalTruth": "..."}]}`;

  const prompt = `Objetivo de aprendizado: "${goal}"\nGere o DAG em JSON:`;
  return { systemPrompt, prompt };
}

export function buildProbeQuestionPrompt(
  node: ConceptNode,
  goal: string,
  previousQuestions: string[]
): { systemPrompt: string; prompt: string } {
  const systemPrompt = `Você é o Gerador Cirúrgico de questões diagnósticas do APRENDA.
Crie UMA questão de múltipla escolha que teste compreensão real (não memorização) do conceito indicado, preferencialmente contextualizada em uma situação concreta ou problema aplicado.
Regras:
- Exatamente 4 alternativas homogêneas e plausíveis; os distratores devem capturar equívocos frequentes de estudantes.
- Apenas 1 alternativa correta.
- Não repita questões anteriores.
${LANG_RULE}
Responda SOMENTE em JSON:
{"questionText": "...", "options": ["...", "...", "...", "..."], "correctOptionIndex": 0, "anchorConcept": "conceito testado em poucas palavras", "difficulty": 1}`;

  const prompt = `Objetivo geral do estudante: "${goal}"
Conceito: ${node.title}
Resumo: ${node.summary}
Verdade incondicional: ${node.unconditionalTruth}
Nível de dificuldade sugerido: ${node.level}/4
${previousQuestions.length ? `Questões já aplicadas (não repita):\n- ${previousQuestions.slice(-6).join('\n- ')}` : ''}
Gere a questão em JSON:`;

  return { systemPrompt, prompt };
}

export function buildPredictPrompt(node: ConceptNode, goal: string): { systemPrompt: string; prompt: string } {
  const systemPrompt = `Você é o Professor Socrático do APRENDA. Antes de ensinar um conceito, você faz o estudante PREVER o comportamento/resultado a partir da intuição (Princípio: "Como eu poderia ter descoberto isso?").
Crie uma pergunta de previsão curta (2-3 frases), instigante, baseada em uma situação concreta, que o estudante consiga responder com raciocínio próprio sem conhecer a definição formal.
${LANG_RULE}
Responda SOMENTE em JSON: {"questionText": "...", "promptGoal": "instrução curta ao estudante"}`;

  const prompt = `Objetivo geral: "${goal}"
Conceito: ${node.title}
Resumo: ${node.summary}
Verdade incondicional: ${node.unconditionalTruth}
Gere a pergunta de previsão em JSON:`;

  return { systemPrompt, prompt };
}

export type ProbeQuestionDraft = Omit<QuestionData, 'id' | 'nodeId'>;
