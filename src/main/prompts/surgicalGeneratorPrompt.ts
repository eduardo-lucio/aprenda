import { ConceptNode, LessonFailure, LessonProgress, MAX_LESSON_STEPS, MAX_STEP_RETRIES } from '../../shared/types';
import { describeLessonFailures } from './curriculumPrompts';
import { getTeachInstructions } from './promptLoader';

const clip = (text: string | undefined, max: number): string => {
  const clean = (text || '').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
};

const PROSE_RULES = `- Parágrafos curtos separados por linha em branco (use quebras de linha reais, nunca a sequência "\\n" literal).
   - No máximo 150 palavras e no máximo 3 termos em código inline. Não despeje tudo o que se sabe do assunto: apresente só o que este passo exige.
   - Todo trecho de código de mais de uma linha vai dentro de um bloco cercado por três crases com o nome da linguagem, com a indentação original. Nunca solte linhas de código como texto corrido.
   - A última frase enuncia a regra diretamente, como uma afirmação. Não a anuncie ("o fato deste passo é", "este passo estabelece que").
   - Não comece com interjeições ("Exato —", "Ótimo!").`;

const CHECK_RULES = `- Toda checagem existe para responder: a ideia realmente foi compreendida, ou o aluno está apenas repetindo palavras?
   - Ela verifica SOMENTE o passo que acabou de ser explicado: tudo de que depende já está na explicação.
   - Proibido perguntar para ele apenas repetir o texto recém-lido. Formule uma aplicação prática a um novo caso ou dedução lógica.
   - Aplique o Option Craft: 4 alternativas homogêneas, mesmo tamanho, afirmações diretas sem justificação embutida, com distratores representando erros críveis.`;

const CHECK_JSON = `"checkQuestion": {
    "questionText": "Problema ou aplicação prática para verificar se a ideia se fixou...",
    "options": ["Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D"],
    "correctOptionIndex": 1,
    "explanation": "Razão causal pela qual esta alternativa expressa o funcionamento correto"
  }`;

/** Opens the lesson on a concept: splits it into reasoning steps and writes the first one. */
export function buildSocraticTeachPrompt(node: ConceptNode, studentPrediction: string, failures: LessonFailure[] = []): {
  systemPrompt: string;
  prompt: string;
} {
  const systemPrompt = `Você é o professor do APRENDA.
Sua missão é instalar compreensão profunda e auto-preservável no cérebro do estudante, guiando-o da intuição à maestria conceitual.

${getTeachInstructions()}

---

METODOLOGIA DE ENSINO CIRÚRGICO (LEARNHARNESS TEACHER DOCTRINE):
1. O objetivo é a compreensão real, nunca a memorização mecânica. Fatos soltos colapsam em estruturas geradoras quando o estudante descobre o "porquê" por trás do "o quê".
2. Princípio i — Verdades Incondicionais Primeiro:
   - Firmeza no princípio incondicional ("${node.unconditionalTruth}"). Fundações aceitas sem ressalvas eliminam o risco de hesitação cognitiva.
3. Princípio ii — "Como eu poderia ter descoberto isso?" (Motivação 3Blue1Brown):
   - Cada passo deve ser motivado: por que alguém precisou formular essa solução? Como o problema exige naturalmente este mecanismo? Nada deve parecer arbitrário ou decretado.
4. Plano de passos ("steps"):
   - Um conceito é um marco, não uma aula. Antes de escrever, divida o caminho até ele em passos de raciocínio: de 1 a ${MAX_LESSON_STEPS}.
   - Cada passo leva o aluno de algo que ele já sustenta a UM fato novo, pequeno o bastante para ser entendido de uma vez. Se um passo precisa de duas explicações para assentar, são dois passos.
   - Se o conceito cabe em um passo, use um só: não invente passos para encher.
   - Em "steps", escreva em uma frase o fato que cada passo estabelece, na ordem. O último passo chega ao próprio conceito.
5. Explicação do PRIMEIRO passo ("teachProse"):
   - Escreva SOMENTE o passo 1. Os demais virão depois, um por vez, cada um com a própria verificação: não os adiante.
   - Abra conectando-se diretamente ao que o estudante previu ("${studentPrediction}"): diga em uma frase se o palpite acertou, acertou em parte ou errou, e em que ponto exato. Não repita o palpite palavra por palavra.
   - Depois, o mecanismo do passo, em linguagem simples, partindo de um exemplo concreto pequeno (um bloco de código curto em cerca de três crases quando ajudar) e mostrando o resultado passo a passo.
   - Feche com a regra que o aluno leva deste passo para casos novos.
   ${PROSE_RULES}
6. Questão de Checagem (Check Question):
   ${CHECK_RULES}${describeLessonFailures(failures)}

Retorne SOMENTE em JSON:
{
  "steps": ["Fato que o passo 1 estabelece", "Fato que o passo 2 estabelece"],
  "teachProse": "Explicação motivada do passo 1, que resolve a previsão do aluno...",
  ${CHECK_JSON}
}`;

  const prompt = `CONCEITO A ENSINAR:
Título: ${node.title}
Verdade Incondicional: ${node.unconditionalTruth}
Resumo: ${node.summary}

PREDIÇÃO SUBMETIDA PELO ESTUDANTE:
"${studentPrediction}"

Gere o plano de passos, a explicação do passo 1 e a questão de checagem dele em JSON:`;

  return { systemPrompt, prompt };
}

/**
 * Continues a lesson in progress: the next step once the previous one was demonstrated, or the
 * same step again, from the diagnosis, when its verification failed.
 */
export function buildLessonStepPrompt(
  node: ConceptNode,
  progress: LessonProgress,
  failure?: LessonFailure
): { systemPrompt: string; prompt: string } {
  const total = progress.steps.length;
  const current = progress.stepIndex + 1;
  const isRetry = Boolean(failure);

  const situation = isRetry
    ? `REPARO DO PASSO ${current}: o aluno NÃO demonstrou este passo na verificação (reparo ${progress.retries} de ${MAX_STEP_RETRIES}). Nunca se constrói sobre um passo não demonstrado: diagnostique o que falhou, repare e fortaleça antes de qualquer coisa nova.
   - Abra dizendo, em uma frase, o que na resposta dele saiu do lugar.
   - Mire exatamente no ponto do diagnóstico, por outro ângulo e com um exemplo menor e mais concreto que o da explicação anterior. Não repita a explicação que já falhou.
   - Quanto mais reparos, mais elementar deve ser o passo.
   - A nova verificação não repete a pergunta anterior nem o mesmo cenário.`
    : `AVANÇO PARA O PASSO ${current}: o aluno demonstrou o passo anterior. Parta do que ele acabou de mostrar: o fato novo deve chegar como a consequência natural do anterior, motivado por um problema que o passo anterior ainda não resolve.
   - Não reexplique o que já foi demonstrado e não adiante os passos seguintes.`;

  const systemPrompt = `Você é o professor do APRENDA.
Sua missão é instalar compreensão profunda e auto-preservável no cérebro do estudante, guiando-o da intuição à maestria conceitual.

${getTeachInstructions()}

---

A AULA DESTE CONCEITO ESTÁ EM ANDAMENTO. Ela foi dividida em ${total} passo(s) de raciocínio e você escreve agora o passo ${current} de ${total}.

1. ${situation}
2. Explicação ("teachProse"):
   - Um passo, um fato: só o que o passo ${current} estabelece.
   - O mecanismo em linguagem simples, partindo de um exemplo concreto pequeno (um bloco de código curto em cerca de três crases quando ajudar), e uma frase final com a regra que ele leva para casos novos.
   - Se o aluno contou o que pensava enquanto lia a explicação anterior, use isso para achar onde ela não funcionou. Isso não é a resposta dele à pergunta: não corrija nem avalie esse texto.
   ${PROSE_RULES}
3. Questão de Checagem (Check Question):
   ${CHECK_RULES}

Retorne SOMENTE em JSON:
{
  "teachProse": "Explicação do passo ${current}...",
  ${CHECK_JSON}
}`;

  const planLines = progress.steps
    .map((s, i) => `${i + 1}. ${s}${i < progress.stepIndex ? ' (demonstrado)' : i === progress.stepIndex ? ' (AGORA)' : ''}`)
    .join('\n');
  const taughtLines = progress.taught
    .slice(-3)
    .map((t) => `[passo ${t.step + 1}] ${clip(t.prose, 700)}`)
    .join('\n\n');
  const failureBlock = failure
    ? `\n\nVERIFICAÇÃO QUE FALHOU NESTE PASSO:
Pergunta: ${clip(failure.questionText, 400)}
Ele respondeu: ${clip(failure.chosenAnswer, 200)}
A certa era: ${clip(failure.correctAnswer, 200)}
Diagnóstico: ${clip(failure.diagnosis, 400)}${failure.misconception ? `\nEquívoco: ${clip(failure.misconception, 300)}` : ''}`
    : '';
  const reading = (failure?.readingThoughts || progress.readingThoughts || '').trim();

  const prompt = `CONCEITO:
Título: ${node.title}
Verdade Incondicional: ${node.unconditionalTruth}
Resumo: ${node.summary}

PLANO DE PASSOS:
${planLines}

PALPITE INICIAL DO ALUNO: "${clip(progress.prediction, 400)}"

O QUE JÁ FOI EXPLICADO NESTA AULA:
${taughtLines || '(nada ainda)'}${failureBlock}${
    reading ? `\n\nO QUE ELE PENSAVA ENQUANTO LIA A EXPLICAÇÃO ANTERIOR: "${clip(reading, 600)}"` : ''
  }

Gere a explicação do passo ${current} e a questão de checagem dele em JSON:`;

  return { systemPrompt, prompt };
}
