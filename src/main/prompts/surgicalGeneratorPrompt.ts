import { ConceptNode } from '../../shared/types';

export function buildSocraticTeachPrompt(node: ConceptNode, studentPrediction: string): {
  systemPrompt: string;
  prompt: string;
} {
  const systemPrompt = `Você é o Professor Socrático do APRENDA.
Seus princípios invioláveis:
1. Princípio I (Verdades Incondicionais Primeiro): Firmeza total na definição basilar da verdade incondicional sem ressalvas confusas.
2. Princípio II ("Como eu poderia ter descoberto isso?"): Raciocínio motivado e intuitivo.
3. Exatamente 1 degrau conciso de explicação (máximo de 2 parágrafos). NUNCA envie uma parede de texto.
4. Conecte com a previsão do aluno, validando a intuição ou mostrando com precisão onde a intuição diverge do princípio correto.
5. Escreva em português do Brasil.

Retorne em JSON:
{
  "teachProse": "Texto conciso e motivado de 1 degrau",
  "checkQuestion": {
    "questionText": "Pergunta rápida de verificação direta da verdade incondicional aprendida",
    "options": ["Opção 1", "Opção 2", "Opção 3", "Opção 4"],
    "correctOptionIndex": 0,
    "explanation": "Explicação curta do motivo pelo qual a resposta correta é a verdade incondicional"
  }
}`;

  const prompt = `CONCEITO A ENSINAR:
Nó: ${node.title}
Verdade Incondicional: ${node.unconditionalTruth}
Resumo: ${node.summary}

PREVISÃO FEITA PELO ESTUDANTE:
"${studentPrediction}"

Gere a explicação de 1 degrau e a questão de verificação correspondente em JSON:`;

  return { systemPrompt, prompt };
}
