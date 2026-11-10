import { CompletedLesson, ConceptNode, LessonFailure, ProbeAttempt, StrandSummary } from '../../shared/types';
import {
  getGraphInstructions,
  getNotesInstructions,
  getOrientationInstructions,
  getPlanInstructions,
  getPredictInstructions,
  getProberInstructions,
} from './promptLoader';

const clip = (text: string | undefined, max: number): string => {
  const clean = (text || '').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
};

export function buildGoalOptionsPrompt(
  goal: string,
  orientation?: { justification?: string }
): { systemPrompt: string; prompt: string } {
  const shared = getOrientationInstructions();
  const orientationBlock = orientation
    ? `

O ALUNO PEDIU ORIENTAÇÃO: ele não reconheceu seu objetivo nas opções anteriores e não sabe por onde começar.${
        orientation.justification ? ` O que ele disse: "${orientation.justification}".` : ''
      } Agora as 8 primeiras opções devem ser pontos de entrada mais simples, descritos pelo que o aluno vai conseguir fazer ou entender, em linguagem de quem ainda não conhece os termos técnicos do tema.`
    : '';

  const systemPrompt = `Você é o Orientador Pedagógico e Investigador de Fronteira do APRENDA.
${shared}

O estudante escreveu o seguinte pedido inicial (texto bruto, pode ser uma frase completa): "${goal}".
PRIMEIRO identifique o TEMA central do pedido (ex.: "eu quero aprender sobre tcp/udp" → "TCP e UDP"). NUNCA copie a frase do estudante dentro da pergunta ou das opções; use apenas o nome limpo do tema.
Como o objetivo é amplo ou pode abranger diferentes recortes, sua tarefa é formular uma pergunta direta de clarificação E propor exatamente 9 alternativas técnicas, concretas e distintas para delimitar com precisão o objetivo de aprendizagem.${orientationBlock}

DIRETRIZES OBRIGATÓRIAS DAS 9 OPÇÕES:
1. A pergunta ("question") deve seguir o padrão: "O que exatamente você quer aprender sobre <TEMA>? Escolha a opção que melhor descreve seu objetivo:", onde <TEMA> é o tema limpo que você identificou.
1b. TODAS as opções devem ser geradas por você, específicas e tecnicamente corretas para o tema real (nada genérico; não assuma que o tema é uma linguagem de programação).
2. As 8 primeiras opções devem mapear recortes concretos e técnicos indispensáveis do tema, cobrindo desde os fundamentos primitivos, passando pelos mecanismos estruturais, até aplicações, ecossistemas ou tópicos avançados.
3. Cada opção deve ter entre 4 e 16 palavras, especificando subtópicos concretos entre parênteses quando relevante (ex: "Fundamentos da linguagem (variáveis, funções, controle de fluxo, objetos, arrays)").
4. A 9ª opção DEVE ser exatamente: "Outro / não sei ainda — quero orientação".
5. Em "agentThinking", escreva uma nota curta (2 a 4 frases) do tutor ao aluno, em primeira pessoa e linguagem simples, dizendo como dividiu o tema "${goal}" nessas opções.

Responda EXCLUSIVAMENTE em formato JSON:
{
  "agentThinking": "Nota curta do tutor, em primeira pessoa e linguagem simples...",
  "question": "O que exatamente você quer aprender sobre <TEMA>? Escolha a opção que melhor descreve seu objetivo:",
  "options": [
    "Recorte 1 (subtópicos essenciais...)",
    "Recorte 2 (subtópicos essenciais...)",
    "Recorte 3 (subtópicos essenciais...)",
    "Recorte 4 (subtópicos essenciais...)",
    "Recorte 5 (subtópicos essenciais...)",
    "Recorte 6 (subtópicos essenciais...)",
    "Recorte 7 (subtópicos essenciais...)",
    "Recorte 8 (subtópicos essenciais...)",
    "Outro / não sei ainda — quero orientação"
  ]
}`;

  const prompt = `Tema de estudo do aluno: "${goal}"\nGere a nota do tutor, a pergunta de clarificação e as 9 opções em JSON:`;
  return { systemPrompt, prompt };
}

export function buildGraphPrompt(
  goal: string,
  context?: { topic?: string; justification?: string }
): { systemPrompt: string; prompt: string } {
  const instructions = getGraphInstructions();

  const systemPrompt = `Você é o Arquiteto Curricular do APRENDA.
${instructions}

Sua tarefa é decompor o objetivo "${goal}" em um GRAFO ACÍCLICO DIRIGIDO (DAG) de dependências conceituais (de 6 a 8 nós, Níveis 1 a 4) em ordem estritamente crescente de complexidade, E formular a PRIMEIRA questão diagnóstica para o nó MAIS AVANÇADO que o objetivo exige (o de maior nível).

Regras da Estrutura do Grafo (DAG):
- 6 a 8 nós estruturais essenciais ao tema.
- "id": slug permanente em kebab-case (ex: "camada-enlace-quadros").
- "level": 1 (verdade incondicional / base fundamental sem pré-requisitos) a 4 (síntese mais avançada do objetivo).
- "prerequisites": lista de ids de nós de nível MENOR necessários para compreender o conceito atual. Nós de nível 1 têm prerequisites vazios [].
- "summary": 1 frase direta e técnica sintetizando o mecanismo.
- "unconditionalTruth": 1 frase formulando o princípio invariante aceito pelo valor de face ("Princípio i: Verdades Incondicionais Primeiro" — ex: afirmações universais "Todo X é feito através de Y").

Regras da Primeira Questão ("firstQuestion"):
- Alvo: o nó de MAIOR NÍVEL do grafo (o ponto mais difícil que o objetivo exige). A sondagem entra pelo topo: um acerto poupa todas as perguntas sobre o que está abaixo, e um erro faz a próxima pergunta descer. Nunca abra pela base para "aquecer".
- "questionText": enunciado prático contextualizado com um problema real que só se resolve entendendo esse conceito (NÃO use perguntas teóricas genéricas como "qual é o princípio correto"). Quando o tema envolver código, comandos ou sintaxe técnica, inclua trechos de código formatados em blocos Markdown com crases triplas (\`\`\`linguagem ... \`\`\`) e envolva identificadores, valores, tipos ou erros inline entre crases simples (\`codigo\`).
- "options": 4 alternativas homogêneas elaboradas estritamente sob o OPTION CRAFT (afirmações diretas, zero justificativa embutida, mesmo registro, distratores representando erros críveis). Quando as alternativas contiverem valores de retorno, saídas, comandos ou erros de código, envolva-os entre crases simples (\`...\`).
- "correctOptionIndex": índice numérico (0 a 3) da correta.
- "anchorConcept": título do conceito.
- "difficulty": o nível do nó alvo.
- "agentThinking": uma nota curta (2 a 4 frases) do tutor ao aluno, em primeira pessoa e linguagem simples, dizendo que vamos começar por um ponto avançado para descobrir rápido até onde ele já vai, e que não saber é uma resposta útil: a pergunta seguinte fica mais simples.

Responda SOMENTE em JSON no formato:
{
  "discipline": "nome curto da disciplina/área",
  "agentThinking": "Nota curta do tutor, em primeira pessoa e linguagem simples...",
  "nodes": [
    {
      "id": "slug-base",
      "title": "Título do Conceito",
      "summary": "Resumo técnico em 1 frase",
      "level": 1,
      "prerequisites": [],
      "unconditionalTruth": "Verdade incondicional sem ressalvas"
    }
  ],
  "firstQuestion": {
    "nodeId": "slug-do-no-de-maior-nivel",
    "questionText": "Enunciado contextualizado com cenário real...",
    "options": ["Afirmação A", "Afirmação B", "Afirmação C", "Afirmação D"],
    "correctOptionIndex": 2,
    "anchorConcept": "Título do Conceito",
    "difficulty": 4
  }
}`;

  const contextLines = [
    context?.topic && context.topic !== goal ? `Tema que o aluno digitou: "${context.topic}"` : '',
    context?.justification ? `Por que o aluno escolheu esse foco: "${context.justification}"` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const prompt = `Objetivo de estudo: "${goal}"${contextLines ? `\n${contextLines}` : ''}\nGere o grafo em ordem crescente (Nível 1 a 4), a nota do tutor e a primeira questão sobre o nó de maior nível em JSON:`;
  return { systemPrompt, prompt };
}

export function buildProbeQuestionPrompt(
  node: ConceptNode,
  goal: string,
  previousQuestions: string[],
  options?: { harderThan?: string[] }
): { systemPrompt: string; prompt: string } {
  const proberInstructions = getProberInstructions();
  const harderThan = options?.harderThan?.filter(Boolean) || [];
  const escalation = harderThan.length
    ? `

ESCALADA: o aluno já respondeu com domínio a(s) pergunta(s) abaixo sobre este mesmo conceito. Um conceito que nunca quebra ainda não foi medido.
- ${harderThan.slice(-2).map((q) => clip(q, 300)).join('\n- ')}
- A nova pergunta deve ser visivelmente mais difícil que essas: um caso de borda, uma consequência de segunda ordem ou a combinação com outro conceito do objetivo.
- Continue dentro do que o objetivo exige: mais difícil não é mais obscuro, nem fora do tema.
- A nota do tutor continua curta (2 a 4 frases) e fala com ele por "você": diga só que a anterior foi bem e que esta sobe o nível. Nunca adiante o que a pergunta testa nem o caminho da resposta.`
    : '';

  const systemPrompt = `Você é o Gerador Cirúrgico do APRENDA.
${proberInstructions}

Crie UMA questão diagnóstica contextualizada e profunda focada no conceito "${node.title}" (Nível ${node.level}/4) para delimitar cirurgicamente a fronteira de conhecimento do estudante.

Diretrizes da Questão Diagnóstica (Option Craft):
- O enunciado deve apresentar um problema prático, cenário de aplicação real ou análise de caso que exija dedução a partir do princípio fundamental (não uma pergunta mecânica ou memorização de rótulos).
- Quando a questão envolver programação, comandos ou sintaxe técnica, formate os trechos de código em blocos Markdown (\`\`\`linguagem\\n...\\n\`\`\`) e envolva expressões, identificadores, saídas ou erros inline em crases simples (\`...\`), tanto no enunciado quanto nas alternativas.
- 4 alternativas homogêneas, mesmo esqueleto, mesmo tom e afirmações diretas sem justificativa embutida.
- Distratores devem capturar atalhos heurísticos falhos ou modelos mentais equivocados comuns em estudantes universitários.
- Não repita formulações de questões anteriores.
- "agentThinking": uma nota curta (2 a 4 frases) do tutor ao aluno, em primeira pessoa, tratando-o por "você" e em linguagem simples, dizendo por que esta pergunta vem agora. Sem jargão. O aluno lê a nota antes de responder: nunca comente as alternativas, os erros que elas capturam, a resposta ou o que você fará depois, e não diga em que ponto da sessão estamos.${escalation}

Responda SOMENTE em JSON:
{
  "agentThinking": "Nota curta do tutor, em primeira pessoa e linguagem simples...",
  "questionText": "Enunciado prático contextualizado...",
  "options": ["Opção 0", "Opção 1", "Opção 2", "Opção 3"],
  "correctOptionIndex": 3,
  "anchorConcept": "${node.title}",
  "difficulty": ${node.level || 2}
}`;

  const prompt = `Objetivo de estudo: "${goal}"
Conceito: ${node.title} (${node.id})
Resumo: ${node.summary}
Verdade Incondicional / Princípio Invariante: ${node.unconditionalTruth}
Nível de complexidade: ${node.level}/4
${previousQuestions.length ? `Questões já aplicadas na sessão (evite repeti-las):\n- ${previousQuestions.slice(-4).join('\n- ')}` : ''}

Gere a questão diagnóstica e a nota do tutor em JSON:`;

  return { systemPrompt, prompt };
}

/** What the next attempt at a concept must know about the verifications the student failed. */
export function describeLessonFailures(failures: LessonFailure[]): string {
  if (failures.length === 0) return '';
  const lines = failures.slice(-2).map(
    (f) =>
      `- Pergunta: ${clip(f.questionText, 300)} | respondeu: ${clip(f.chosenAnswer, 150)} | certa: ${clip(f.correctAnswer, 150)} | diagnóstico: ${clip(f.diagnosis, 300)}${
        f.misconception ? ` | equívoco: ${clip(f.misconception, 200)}` : ''
      }`
  );
  return `

RETOMADA DO CONCEITO: o aluno ainda não dominou este conceito (${failures.length} verificação(ões) sem domínio) e só avança quando dominar.
${lines.join('\n')}
- Mire exatamente no ponto que falhou, com um caso menor e mais concreto do que os anteriores.
- Use outro exemplo e outro ângulo; não repita nenhuma pergunta acima.
- Quanto mais tentativas, mais simples e elementar deve ser o passo.`;
}

export function buildPredictPrompt(
  node: ConceptNode,
  goal: string,
  failures: LessonFailure[] = []
): { systemPrompt: string; prompt: string } {
  const teacherInstructions = getPredictInstructions();

  const systemPrompt = `Você é o professor do APRENDA.
${teacherInstructions}

DOUTRINA DA PREDIÇÃO (TEACHER PREDICTION CYCLE):
- Uma predição NÃO é um teste com nota: é uma provocação intuitiva formulada ANTES de ensinar formalmente o próximo passo.
- Objetivo: fazer o estudante tentar descobrir o próximo passo por si mesmo ("Princípio ii: Como eu poderia ter descoberto isso?").
- Aponte a motivação ou a limitação do estado atual ("Isso funciona bem, mas não sobrevive a X — o que você intui que deve acontecer?").
- Curto (1 a 2 frases provocativas), focado na intuição natural.
- "questionText" contém somente a pergunta; nunca escreva o nome de um campo do JSON dentro dele.${describeLessonFailures(failures)}

Responda SOMENTE em JSON:
{
  "questionText": "Pergunta curta de predição motivada...",
  "promptGoal": "Instrução sucinta guiando a intuição do aluno"
}`;

  const prompt = `Objetivo: "${goal}"
Conceito: ${node.title}
Resumo: ${node.summary}
Verdade Incondicional: ${node.unconditionalTruth}
Gere a pergunta de predição em JSON:`;

  return { systemPrompt, prompt };
}

export function buildConceptNotesPrompt(
  goal: string,
  evidence: Array<{ node: ConceptNode; attempts: ProbeAttempt[]; lessons: CompletedLesson[] }>
): { systemPrompt: string; prompt: string } {
  const systemPrompt = `Você é o Anotador do APRENDA.
${getNotesInstructions()}

Escreva o caderno de estudo do aluno: uma anotação para CADA conceito recebido, baseada no que o conceito exige e no que o aluno realmente mostrou nesta sessão.

CADA ANOTAÇÃO TEM:
- "summary": resumo do conceito em 2 a 4 frases, que sirva para revisar depois sem reabrir a aula. Explique a ideia; não descreva o desempenho do aluno.
- "toLearn": de 2 a 6 tópicos concretos que o aluno ainda precisa aprender neste conceito. Priorize equívocos identificados e o que ficou errado na verificação. Se o conceito estiver dominado e nada faltar, use [].
- "learned": os tópicos concretos que o aluno JÁ demonstrou saber. Use apenas evidência: resposta correta com raciocínio sólido, verificação aprovada ou estado "mastered". Conceito sem evidência fica com []. Nunca credite o aluno por algo que só foi explicado a ele.

REGRAS:
- Cada tópico é uma frase nominal curta e específica (máximo de 12 palavras), nunca o título do conceito repetido.
- Um mesmo tópico não aparece nas duas listas.
- Estado "false_positive": o aluno acertou sem sustentar o raciocínio; o ponto frágil vai em "toLearn".

Responda SOMENTE em JSON, usando exatamente os ids recebidos:
{
  "notes": [
    { "nodeId": "id-do-conceito", "summary": "...", "toLearn": ["..."], "learned": ["..."] }
  ]
}`;

  const blocks = evidence.map(({ node, attempts, lessons }) => {
    const attemptLines = attempts.map(
      (a) =>
        `  - Pergunta: ${clip(a.questionText, 300)} | veredito: ${a.verdict} | diagnóstico: ${clip(a.judgeReasoning, 300)}${
          a.identifiedMisconception ? ` | equívoco: ${clip(a.identifiedMisconception, 200)}` : ''
        }`
    );
    const lessonLines = lessons.map(
      (l) =>
        `  - Aula (${l.isPassed ? 'verificação aprovada' : 'verificação reprovada'}): ${clip(l.teachProse, 800)}${
          l.repairExplanation ? ` | correção: ${clip(l.repairExplanation, 300)}` : ''
        }`
    );
    return [
      `CONCEITO ${node.id}: ${node.title} (estado: ${node.status})`,
      `Resumo do mapa: ${node.summary}`,
      `Ideia central: ${node.unconditionalTruth}`,
      attemptLines.length ? `Respostas do aluno:\n${attemptLines.join('\n')}` : 'Respostas do aluno: nenhuma',
      lessonLines.length ? `Aulas concluídas:\n${lessonLines.join('\n')}` : 'Aulas concluídas: nenhuma',
    ].join('\n');
  });

  const prompt = `Objetivo do aluno: "${goal}"\n\n${blocks.join('\n\n')}\n\nGere as anotações em JSON:`;
  return { systemPrompt, prompt };
}

export function buildPlanPrompt(params: {
  goal: string;
  nodes: ConceptNode[];
  attempts: Array<{ nodeId: string; verdict: string; judgeReasoning: string }>;
  strands?: StrandSummary[];
}): { systemPrompt: string; prompt: string } {
  const teacherInstructions = getPlanInstructions();

  const systemPrompt = `Você é o Planejador do APRENDA.
${teacherInstructions}

Com base no que a sondagem revelou, escreva o PLANO DE ENSINO apresentado ao aluno: um texto curto (no máximo 120 palavras, na segunda pessoa) com a abordagem escolhida e a ordem em que os conceitos serão trabalhados, sempre do conceito mais básico (menor nível) para o mais avançado, nunca um conceito antes dos seus fundamentos, avisando que cada conceito só libera o seguinte depois de dominado. Não repita o que já está dominado. Cite os conceitos pelo título.

Responda SOMENTE em JSON:
{
  "plan": "Texto do plano...",
  "order": ["id-do-no-1", "id-do-no-2"]
}`;

  const nodeLines = params.nodes
    .map((n) => {
      const att = [...params.attempts].reverse().find((a) => a.nodeId === n.id);
      return `- ${n.id} | ${n.title} | nível ${n.level} | estado: ${n.status}${att ? ` | juiz: ${att.judgeReasoning}` : ''}`;
    })
    .join('\n');

  const titleOf = new Map(params.nodes.map((n) => [n.id, n.title]));
  const titles = (ids: string[]) => ids.map((id) => titleOf.get(id) || id).join(', ');
  const strandLines = (params.strands || [])
    .map(
      (s) =>
        `- Até "${titleOf.get(s.topId) || s.topId}": piso (ele sustenta) = ${titles(s.floor) || 'nada demonstrado'} | teto (onde quebra) = ${
          titles(s.ceiling) || 'não quebrou'
        }${s.misconceptions.length ? ` | equívocos: ${s.misconceptions.map((m) => clip(m, 200)).join('; ')}` : ''}`
    )
    .join('\n');

  const prompt = `Objetivo: "${params.goal}"\nConceitos e resultado da sondagem:\n${nodeLines}${
    strandLines
      ? `\n\nO que a sondagem mediu em cada linha do mapa (conceito "untested" acima de um teto não foi perguntado porque depende do que quebrou):\n${strandLines}`
      : ''
  }\n\nGere o plano em JSON:`;
  return { systemPrompt, prompt };
}
