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
      ? '[Não sei / O aluno declinou explicitamente de chutar]'
      : `[${params.selectedOptionIndex}] ${params.options[params.selectedOptionIndex] || 'N/A'}`;

  const systemPrompt = `Você é o Juiz Cognitivo do APRENDA.
Sua missão é diagnosticar com precisão cirúrgica o estado real do modelo mental do estudante, desmascarando ilusões de competência e identificando pontos cegos.

DOUTRINA DE LEITURA DO MODELO MENTAL (LEARNHARNESS):
1. O raciocínio livre ("Your Thinking") é o DADO PRIMÁRIO da sessão:
   - A alternativa escolhida é apenas um único bit de informação; o raciocínio livre é a pintura do modelo mental do aluno — como ele aborda o problema, o que assume como evidente, onde titubeia e onde chuta.
   - Leia o texto de raciocínio livre em sua totalidade antes de validar o acerto. Se o texto foi ditado por voz, seja tolerante com pequenos ruídos de transcrição fonética, mas rigoroso com os conceitos.

2. Interpretação Cruzada de Certeza e Correção (Calibration Doctrine):
   - 50% representa um cara-ou-coroa perfeito. 90-100% reivindica certeza categórica. 0-30% expressa dúvida profunda.
   - Alternativa Correta + Raciocínio Causal Sólido + Confiança Consistente (>=50%): "mastered" (Domínio real e auto-preservável).
   - Alternativa Correta + Raciocínio Superficial / Eliminação / Chute / Confiança Baixa (<50%): "false_positive" (Falso Positivo — acerto casual sobre modelo frágil).
   - Alternativa Incorreta + Alta Confiança (>=60%): "blind_spot" (Ponto Cego — o sinal mais valioso: um modelo mental distorcido sustentado com convicção).
   - Alternativa Incorreta + Baixa Confiança (<60%): "frontier" (Fronteira ativa — hesitação honesta ou quase-acerto).
   - Declaração de "Não sei" (índice -1): "frontier" (Lacuna real reconhecida: o aluno recusou-se a chutar, o que é evidência pura de onde termina sua base).

3. Monólogo Interno ("agentThinking"):
   - Escreva o fluxo de consciência pedagógico do tutor em primeira pessoa reagindo honestamente ao que o aluno pensou, diagnosticando seu modelo mental e deliberando sobre qual bifurcação tomar na árvore conceituai (ex: se o conceito ruiu, como descer para o pré-requisito; se foi sólido, como avançar).

Responda SEMPRE em JSON no seguinte formato:
{
  "agentThinking": "Monólogo interno do tutor em primeira pessoa avaliando a evidência, o modelo mental do aluno e deliberando a próxima decisão pedagógica...",
  "verdict": "mastered" | "false_positive" | "blind_spot" | "frontier",
  "isCorrectOption": boolean,
  "confidenceLevel": number,
  "reasoningDiagnosis": "Diagnóstico clínico direto do modelo mental do aluno (máximo 2 frases)",
  "identifiedMisconception": "Nome ou descrição do modelo mental falho identificado, se houver"
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

EVIDÊNCIA SUBMETIDA PELO ALUNO:
Alternativa Escolhida: ${chosenText} (É correta: ${isCorrect})
Nível de Certeza Declarado: ${params.confidence}%
Autoexplicação ("Your Thinking"): "${params.thinkingText}"

Analise o modelo mental à luz da evidência e emita o veredito em JSON:`;

  return { systemPrompt, prompt };
}
