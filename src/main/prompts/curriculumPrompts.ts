import { ConceptNode, QuestionData } from '../../shared/types';
import {
  getGraphInstructions,
  getOrientationInstructions,
  getPlanInstructions,
  getPredictInstructions,
  getProberInstructions,
} from './promptLoader';

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

Sua tarefa é decompor o objetivo "${goal}" em um GRAFO ACÍCLICO DIRIGIDO (DAG) de dependências conceituais (de 6 a 8 nós, Níveis 1 a 4) em ordem estritamente crescente de complexidade, E formular a PRIMEIRA questão diagnóstica para o nó FUNDAMENTAL DE BASE (Nível 1).

Regras da Estrutura do Grafo (DAG):
- 6 a 8 nós estruturais essenciais ao tema.
- "id": slug permanente em kebab-case (ex: "camada-enlace-quadros").
- "level": 1 (verdade incondicional / base fundamental sem pré-requisitos) a 4 (síntese mais avançada do objetivo).
- "prerequisites": lista de ids de nós de nível MENOR necessários para compreender o conceito atual. Nós de nível 1 têm prerequisites vazios [].
- "summary": 1 frase direta e técnica sintetizando o mecanismo.
- "unconditionalTruth": 1 frase formulando o princípio invariante aceito pelo valor de face ("Princípio i: Verdades Incondicionais Primeiro" — ex: afirmações universais "Todo X é feito através de Y").

Regras da Primeira Questão ("firstQuestion"):
- Alvo: o nó raiz de NÍVEL 1 (base fundamental) para verificar se o estudante possui o chão sólido antes de avançar na árvore.
- "questionText": enunciado prático contextualizado com um problema real sobre o fundamento de base (NÃO use perguntas teóricas genéricas como "qual é o princípio correto"). Quando o tema envolver código, comandos ou sintaxe técnica, inclua trechos de código formatados em blocos Markdown com crases triplas (\`\`\`linguagem ... \`\`\`) e envolva identificadores, valores, tipos ou erros inline entre crases simples (\`codigo\`).
- "options": 4 alternativas homogêneas elaboradas estritamente sob o OPTION CRAFT (afirmações diretas, zero justificativa embutida, mesmo registro, distratores representando erros críveis). Quando as alternativas contiverem valores de retorno, saídas, comandos ou erros de código, envolva-os entre crases simples (\`...\`).
- "correctOptionIndex": índice numérico (0 a 3) da correta.
- "anchorConcept": título do conceito.
- "difficulty": 1.
- "agentThinking": uma nota curta (2 a 4 frases) do tutor ao aluno, em primeira pessoa e linguagem simples, dizendo por onde vamos começar e por quê.

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
    "nodeId": "slug-base",
    "questionText": "Enunciado contextualizado com cenário real...",
    "options": ["Afirmação A", "Afirmação B", "Afirmação C", "Afirmação D"],
    "correctOptionIndex": 2,
    "anchorConcept": "Título do Conceito",
    "difficulty": 1
  }
}`;

  const contextLines = [
    context?.topic && context.topic !== goal ? `Tema que o aluno digitou: "${context.topic}"` : '',
    context?.justification ? `Por que o aluno escolheu esse foco: "${context.justification}"` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const prompt = `Objetivo de estudo: "${goal}"${contextLines ? `\n${contextLines}` : ''}\nGere o grafo em ordem crescente (Nível 1 a 4), a nota do tutor e a primeira questão de Nível 1 em JSON:`;
  return { systemPrompt, prompt };
}

export function buildProbeQuestionPrompt(
  node: ConceptNode,
  goal: string,
  previousQuestions: string[]
): { systemPrompt: string; prompt: string } {
  const proberInstructions = getProberInstructions();

  const systemPrompt = `Você é o Gerador Cirúrgico do APRENDA.
${proberInstructions}

Crie UMA questão diagnóstica contextualizada e profunda focada no conceito "${node.title}" (Nível ${node.level}/4) para delimitar cirurgicamente a fronteira de conhecimento do estudante.

Diretrizes da Questão Diagnóstica (Option Craft):
- O enunciado deve apresentar um problema prático, cenário de aplicação real ou análise de caso que exija dedução a partir do princípio fundamental (não uma pergunta mecânica ou memorização de rótulos).
- Quando a questão envolver programação, comandos ou sintaxe técnica, formate os trechos de código em blocos Markdown (\`\`\`linguagem\\n...\\n\`\`\`) e envolva expressões, identificadores, saídas ou erros inline em crases simples (\`...\`), tanto no enunciado quanto nas alternativas.
- 4 alternativas homogêneas, mesmo esqueleto, mesmo tom e afirmações diretas sem justificativa embutida.
- Distratores devem capturar atalhos heurísticos falhos ou modelos mentais equivocados comuns em estudantes universitários.
- Não repita formulações de questões anteriores.
- "agentThinking": uma nota curta (2 a 4 frases) do tutor, em primeira pessoa e linguagem simples, dizendo por que esta pergunta vem agora e o que ela vai mostrar. Sem jargão.

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

export function buildPredictPrompt(node: ConceptNode, goal: string): { systemPrompt: string; prompt: string } {
  const teacherInstructions = getPredictInstructions();

  const systemPrompt = `Você é o professor do APRENDA.
${teacherInstructions}

DOUTRINA DA PREDIÇÃO (TEACHER PREDICTION CYCLE):
- Uma predição NÃO é um teste com nota: é uma provocação intuitiva formulada ANTES de ensinar formalmente o próximo passo.
- Objetivo: fazer o estudante tentar descobrir o próximo passo por si mesmo ("Princípio ii: Como eu poderia ter descoberto isso?").
- Aponte a motivação ou a limitação do estado atual ("Isso funciona bem, mas não sobrevive a X — o que você intui que deve acontecer?").
- Curto (1 a 2 frases provocativas), focado na intuição natural.

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

export function buildPlanPrompt(params: {
  goal: string;
  nodes: ConceptNode[];
  attempts: Array<{ nodeId: string; verdict: string; judgeReasoning: string }>;
}): { systemPrompt: string; prompt: string } {
  const teacherInstructions = getPlanInstructions();

  const systemPrompt = `Você é o Planejador do APRENDA.
${teacherInstructions}

Com base no que a sondagem revelou, escreva o PLANO DE ENSINO apresentado ao aluno: um texto curto (no máximo 120 palavras, na segunda pessoa) com a abordagem escolhida e a ordem em que os conceitos serão trabalhados, justificando brevemente por que começar pelo que está frágil ou ausente. Não repita o que já está dominado. Cite os conceitos pelo título.

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

  const prompt = `Objetivo: "${params.goal}"\nConceitos e resultado da sondagem:\n${nodeLines}\n\nGere o plano em JSON:`;
  return { systemPrompt, prompt };
}
