import { ConceptNode } from '../../shared/types';

export function buildCognitiveJudgePrompt(params: {
  node: ConceptNode;
  questionText: string;
  options: string[];
  selectedOptionIndex: number;
  correctOptionIndex: number;
  confidence: number;
  thinkingText: string;
}): { systemPrompt: string; prompt: string } {
  const isCorrect = params.selectedOptionIndex === params.correctOptionIndex;

  const systemPrompt = `Você é o Juiz Cognitivo do APRENDA, um especialista em diagnóstico de limites de conhecimento e desmascaramento de "ilusão de competência" em estudantes universitários.

REGRA PRIMÁRIA INVIOLÁVEL:
1. Desconsidere a alternativa escolhida no primeiro segundo.
2. Avalie PRIMEIRO o raciocínio livre ("thinkingText") do estudante.
3. Se o aluno escolheu a alternativa correta, mas seu raciocínio expressou um conceito incorreto, chute, eliminação superficial ou premissa falsa, você DEVE classificar estritamente como "false_positive" (Falso Positivo - Amarelo).
4. Matriz diagnóstica:
   - Alternativa Correta + Raciocínio Sólido + Confiança Consistente (>=50) => "mastered"
   - Alternativa Correta + Raciocínio Incorreto/Chute/Viciado => "false_positive"
   - Alternativa Incorreta + Alta Confiança (>=60) => "blind_spot"
   - Alternativa Incorreta + Baixa Confiança (<60 ou dúvida honesta) => "frontier"

Escreva o diagnóstico em português do Brasil de forma extremamente CONCISA (máximo 2 a 3 frases no diagnóstico). Responda SEMPRE em JSON no seguinte formato:
{
  "verdict": "mastered" | "false_positive" | "blind_spot" | "frontier",
  "isCorrectOption": boolean,
  "confidenceLevel": number,
  "reasoningDiagnosis": "Explicação clínica curta e direta do diagnóstico cognitivo do aluno (máximo 2 frases)",
  "identifiedMisconception": "Descrição resumida do equívoco ou vazio conceitual identificado, se houver"
}`;

  const prompt = `CONCEITO ALVO:
ID: ${params.node.id}
Título: ${params.node.title}
Verdade Incondicional: ${params.node.unconditionalTruth}
Resumo: ${params.node.summary}

QUESTÃO APLICADA:
Pergunta: ${params.questionText}
Alternativas:
${params.options.map((opt, idx) => `[${idx}] ${opt} ${idx === params.correctOptionIndex ? '(CORRETA)' : ''}`).join('\n')}

RESPOSTA DO ALUNO:
Alternativa Escolhida: [${params.selectedOptionIndex}] ${params.options[params.selectedOptionIndex] || 'N/A'} (É correta: ${isCorrect})
Nível de Confiança Declarado: ${params.confidence}%
Raciocínio Livre ("Your Thinking"): "${params.thinkingText}"

Analise o raciocínio e retorne o veredito em JSON:`;

  return { systemPrompt, prompt };
}
