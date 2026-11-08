import { ConceptNode, ProbeAnswerKind, resolveAnswerKind } from '../../shared/types';

export function buildCognitiveJudgePrompt(params: {
  node: ConceptNode;
  questionText: string;
  options: string[];
  selectedOptionIndex: number;
  answerKind?: ProbeAnswerKind;
  correctOptionIndex: number;
  confidence?: number;
  thinkingText: string;
}): { systemPrompt: string; prompt: string } {
  const kind = resolveAnswerKind(params.selectedOptionIndex, params.answerKind);
  const isCorrect = kind === 'option' && params.selectedOptionIndex === params.correctOptionIndex;

  const chosenText =
    kind === 'dont_know'
      ? '[Não sei / O aluno declinou explicitamente de chutar]'
      : kind === 'own_answer'
      ? '[Resposta própria / O aluno NÃO escolheu nenhuma alternativa e respondeu com as próprias palavras — o texto de autoexplicação abaixo É a resposta]'
      : `[${params.selectedOptionIndex}] ${params.options[params.selectedOptionIndex] || 'N/A'}`;
  const reasoning =
    params.thinkingText.trim() ||
    (kind === 'dont_know'
      ? '(O aluno disse que não sabe e não acrescentou nada.)'
      : '(O aluno não explicou o raciocínio.)');
  const correctnessText = kind === 'option' ? String(isCorrect) : 'não se aplica (sem alternativa escolhida)';

  const systemPrompt = `Você é o Juiz Cognitivo do APRENDA.
Sua missão é diagnosticar com precisão cirúrgica o estado real do modelo mental do estudante, desmascarando ilusões de competência e identificando pontos cegos.

DOUTRINA DE LEITURA DO MODELO MENTAL (LEARNHARNESS):
1. O raciocínio livre ("Your Thinking") é o DADO PRIMÁRIO da sessão:
   - A alternativa escolhida é apenas um único bit de informação; o raciocínio livre é a pintura do modelo mental do aluno — como ele aborda o problema, o que assume como evidente, onde titubeia e onde chuta.
   - Leia o texto de raciocínio livre em sua totalidade antes de validar o acerto. Se o texto foi ditado por voz, seja tolerante com pequenos ruídos de transcrição fonética, mas rigoroso com os conceitos.

2. A confiança é um SINAL, não uma regra de classificação:
   - O aluno declara a probabilidade (em stops fixos: 0, 30, 50, 70, 90, 100%) de que a alternativa escolhida esteja correta. 50 é cara-ou-coroa; 90-100 reivindica certeza; 0-30 expressa dúvida real. Com 4 alternativas o acaso é 25%: confiança igual ou abaixo disso significa que ele desconfia da própria escolha — honestidade, não erro.
   - Cruze confiança com acerto E com o raciocínio livre, e decida você mesmo:
     * Correta + raciocínio causal sólido + confiança alta: "mastered".
     * Correta + confiança baixa, ou raciocínio superficial/por eliminação/chute: conhecimento frágil ou acerto casual — tipicamente "false_positive".
     * Errada + confiança alta: o sinal mais valioso, um modelo mental distorto sustentado com convicção — tipicamente "blind_spot".
     * Errada + confiança baixa: quase-acerto ou lacuna honesta — tipicamente "frontier".
   - Se a confiança não foi informada, julgue apenas por acerto e raciocínio.
   - "Não sei" não traz confiança: o aluno recusou-se a chutar. É lacuna real, "frontier", nunca um erro.
   - RESPOSTA PRÓPRIA: quando o aluno não escolhe alternativa e escreve a resposta, não existe "acerto" de alternativa. Compare o texto dele com a Verdade Incondicional e a alternativa marcada (CORRETA) e julgue o conteúdo:
     * Texto que reproduz o princípio correto com raciocínio causal próprio: "mastered" (se a confiança declarada for alta) ou "false_positive" (se for baixa ou o raciocínio for superficial).
     * Texto que afirma algo incorreto com convicção: "blind_spot".
     * Texto vago, incompleto, evasivo ou com lacuna reconhecida: "frontier".
   - Para alternativa escolhida, o veredito deve ser coerente com o acerto: alternativa correta nunca é "blind_spot" ou "frontier"; alternativa errada nunca é "mastered" ou "false_positive".

3. Nota do tutor ("agentThinking"):
   - Escreva uma nota curta (2 a 4 frases) do tutor ao aluno, em primeira pessoa e linguagem simples: o que a resposta mostrou e o que vem a seguir (voltar a um conceito anterior ou avançar). Sem jargão como "nó", "grafo" ou "modelo mental".

Responda SEMPRE em JSON no seguinte formato:
{
  "agentThinking": "Nota curta do tutor, em primeira pessoa e linguagem simples...",
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
Alternativa Escolhida: ${chosenText} (É correta: ${correctnessText})
Nível de Certeza Declarado: ${params.confidence === undefined ? 'não informado' : params.confidence + '%'}
Autoexplicação ("Your Thinking"): "${reasoning}"

Analise o modelo mental à luz da evidência e emita o veredito em JSON:`;

  return { systemPrompt, prompt };
}
