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
  const isCorrect =
    params.selectedOptionIndex >= 0 &&
    params.selectedOptionIndex === params.correctOptionIndex;

  const chosenText =
    params.selectedOptionIndex === -1
      ? '[Não sei / O aluno declarou explicitamente que ainda não domina este conceito]'
      : `[${params.selectedOptionIndex}] ${params.options[params.selectedOptionIndex] || 'N/A'}`;

  const systemPrompt = `Você é o Juiz Cognitivo do APRENDA, um especialista em diagnóstico de limites de conhecimento e desmascaramento de "ilusão de competência" em estudantes universitários.

REGRA PRIMÁRIA INVIOLÁVEL:
1. Desconsidere a alternativa escolhida no primeiro segundo.
2. Avalie PRIMEIRO o raciocínio livre ("thinkingText") do estudante.
3. Se o aluno escolheu a alternativa correta, mas seu raciocínio expressou um conceito incorreto, chute, eliminação superficial ou premissa falsa, você DEVE classificar estritamente como "false_positive" (Falso Positivo - Amarelo).
4. Matriz diagnóstica:
   - Alternativa Correta + Raciocínio Sólido + Confiança Consistente (>=50) => "mastered"
   - Alternativa Correta + Raciocínio Incorreto/Chute/Viciado => "false_positive"
   - Alternativa Incorreta + Alta Confiança (>=60) => "blind_spot"
   - Alternativa Incorreta + Baixa Confiança (<60 ou dúvida honesta ou "Não sei") => "frontier"

Escreva em "agentThinking" o seu monólogo interno autêntico em primeira pessoa (fluxo de consciência natural do tutor em 2 a 4 parágrafos curtos): reaja diretamente ao que o aluno respondeu ou se ele declarou "Não sei", reflita sobre o que ele domina ou confundiu, e delibere sobre qual passo dar a seguir na sondagem (ex: "Ele não sabe... A sua noção de X ainda não está estabelecida... Vamos retomar com um pré-requisito mais simples... Vou prosseguir." ou "Correto. O raciocínio dele mostrou domínio de X, mas será superficial? Próximo passo: testar Y... Prossiga.").
Responda SEMPRE em JSON no seguinte formato:
{
  "agentThinking": "Monólogo interno em primeira pessoa reagindo à resposta do aluno e deliberando sobre o próximo passo...",
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
Alternativa Escolhida: ${chosenText} (É correta: ${isCorrect})
Nível de Confiança Declarado: ${params.confidence}%
Raciocínio Livre ("Your Thinking"): "${params.thinkingText}"

Analise o raciocínio e retorne o veredito em JSON:`;

  return { systemPrompt, prompt };
}
