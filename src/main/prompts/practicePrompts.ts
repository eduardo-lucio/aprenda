import { MAX_HINT_RUNG, PracticeProblem, PracticeTarget } from '../../shared/types';
import { PracticeDemand } from '../practice/practiceStream';
import { getPracticeInstructions } from './promptLoader';

const clip = (text: string | undefined, max: number): string => {
  const clean = (text || '').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
};

const header = (task: string): string => `Você conduz as sessões de prática do APRENDA.
${getPracticeInstructions()}

---

${task}`;

const MODE_BRIEF: Record<PracticeDemand['mode'], string> = {
  recall: 'RECALL — uma ou duas decisões, situação nova, curto: a proposição precisa vir à mente a partir de pistas fracas ou diferentes das da aula.',
  discrimination:
    'DISCRIMINATION — situações quase gêmeas: a proposição certa precisa vencer uma confundível, e o traço que as separa carrega todo o sinal.',
  composition:
    'COMPOSITION — a cadeia roda inteira sob carga: os alvos se encontram em junções, com dados distratores presentes.',
};

const targetLines = (targets: PracticeTarget[]): string =>
  targets.map((t) => `- ${t.id} | ${t.title} | ${clip(t.truth, 240)}`).join('\n');

const transcript = (problem: PracticeProblem): string =>
  problem.turns
    .map((t) => {
      const who = t.role === 'student' ? 'ALUNO' : 'VOCÊ';
      const what =
        t.kind === 'work' ? 'raciocínio em andamento' : t.kind === 'claim' ? 'resposta entregue' : t.kind === 'hint' ? `dica (degrau R${t.rung})` : t.kind === 'verdict' ? `veredito (${t.correct ? 'certo' : 'errado'})` : t.kind === 'question' ? 'pergunta' : 'resposta';
      return `${who} — ${what}: ${clip(t.text, 600)}`;
    })
    .join('\n');

/** Poses one problem. On the first problem of a free topic it also draws the targets from it. */
export function buildPosePrompt(params: {
  material: string;
  targets: PracticeTarget[];
  demand: PracticeDemand;
  history: PracticeProblem[];
}): { systemPrompt: string; prompt: string } {
  const needTargets = params.targets.length === 0;
  const retested = params.demand.retestOf ? params.history.find((p) => p.id === params.demand.retestOf) : undefined;

  const systemPrompt = header(`TAREFA: POSAR UM PROBLEMA.
${
    needTargets
      ? `- O material chegou como um tema livre. Antes de posar, tire dele de 3 a 6 PROPOSIÇÕES que o aluno deve sustentar: cada uma é um fato ou mecanismo do tema, com "title" curto e "truth" em uma frase. Não acrescente nada fora do tema. Devolva-as em "targets", na ordem em que quer exercitá-las; o primeiro problema exercita a primeira.`
      : `- Exercite exatamente os alvos indicados em "ALVO(S) DESTE PROBLEMA". Não exija nada além do material.`
  }
- Modo: ${MODE_BRIEF[params.demand.mode]}
- Dificuldade ${params.demand.difficulty} de 5 (1 = perto da situação em que a ideia foi aprendida; 5 = no limite do que o material permite). Dentro do modo, a dificuldade é distância da pista, semelhança de superfície ou comprimento e interferência.
- Situação: uma classe de pista ainda não usada para este alvo nesta sessão. Nunca repita a superfície de um problema anterior.${
    retested
      ? `\n- RETESTE: o aluno falhou neste alvo antes (enunciado anterior: "${clip(retested.statement, 300)}"). Mesma exigência, superfície completamente nova.`
      : ''
  }
- O enunciado nunca anuncia o alvo.
- Fixe a solução-modelo ANTES de escrever o enunciado: resolva o problema, com os movimentos em ordem, e tente quebrá-lo. Um problema que se resolve por um atalho que pula o alvo ensina o atalho: conserte ou troque.
- "statement" é só o que o aluno vê. "modelSolution" é a sua solução trabalhada, completa, que ele verá ao concluir.
- Nos dois campos, todo código de mais de uma linha vai em bloco cercado por três crases com o nome da linguagem e a indentação original; nunca como texto corrido.

Responda SOMENTE em JSON:
{${needTargets ? '\n  "targets": [{ "title": "Proposição", "truth": "Fato em uma frase" }],' : ''}
  "modelSolution": "Solução trabalhada, com os movimentos em ordem...",
  "statement": "Enunciado do problema..."
}`);

  const asked = params.history
    .slice(-6)
    .map((p) => `- [${p.targetIds.join(', ')} · ${p.mode}] ${clip(p.statement, 200)}`)
    .join('\n');
  const prompt = `MATERIAL DA SESSÃO: "${clip(params.material, 600)}"
${needTargets ? '' : `\nALVOS DA SESSÃO (id | título | proposição):\n${targetLines(params.targets)}\n\nALVO(S) DESTE PROBLEMA: ${params.demand.targetIds.join(', ')}\n`}
PROBLEMAS JÁ POSTOS (não repita a superfície):
${asked || '(nenhum)'}

Pose o problema em JSON:`;
  return { systemPrompt, prompt };
}

const problemBlock = (problem: PracticeProblem, modelSolution: string, targets: PracticeTarget[]): string => {
  const own = targets.filter((t) => problem.targetIds.includes(t.id));
  return `PROBLEMA ATIVO (${problem.mode}, dificuldade ${problem.difficulty}):
${problem.statement}

ALVO(S): 
${targetLines(own) || '(tema livre)'}

SUA SOLUÇÃO-MODELO (privada: o aluno ainda não a vê):
${modelSolution}

O QUE JÁ ACONTECEU NESTE PROBLEMA:
${transcript(problem) || '(nada ainda)'}`;
};

/** Answers thinking in progress: one rung of the hint ladder, never more than one above the last. */
export function buildHelpPrompt(params: {
  problem: PracticeProblem;
  modelSolution: string;
  targets: PracticeTarget[];
  text: string;
}): { systemPrompt: string; prompt: string } {
  const ceiling = Math.min(MAX_HINT_RUNG, params.problem.maxRung + 1);
  const systemPrompt = header(`TAREFA: RESPONDER A UM RACIOCÍNIO EM ANDAMENTO (o aluno está no meio do problema, travado ou pedindo um empurrão). Isto NÃO é uma resposta entregue.
- Do raciocínio, diagnostique a primeira pergunta do ciclo que ele não consegue responder — ou respondeu errado — e responda exatamente a ela, no grão mais grosso que destrava.
- Um degrau por pedido. O degrau mais revelador permitido agora é R${ceiling}; use um menor sempre que bastar. Um pedido vazio ("travei") começa do topo da escada (R0).
- Se ele está executando com a proposição errada, a resposta mínima é um aviso de verificação: aponte para a suposição, nunca diga a correção enquanto ele ainda pode gerá-la.
- Se ele não entendeu o ENUNCIADO, isso não é dica: conserte o enunciado por inteiro e marque "statementRepair": true (não gasta degrau).
- Nunca revele o que ele ainda pode gerar. Nunca escreva a solução-modelo.
- "reply" fala com ele por "você", em 1 a 3 frases.

Responda SOMENTE em JSON:
{
  "statementRepair": false,
  "rung": 0,
  "reply": "..."
}`);
  const prompt = `${problemBlock(params.problem, params.modelSolution, params.targets)}

RACIOCÍNIO QUE ELE ENVIOU AGORA: "${clip(params.text, 1500) || '(vazio: só pediu ajuda)'}"

Responda em JSON:`;
  return { systemPrompt, prompt };
}

/** Judges a handed-in answer against the committed solution. */
export function buildClaimPrompt(params: {
  problem: PracticeProblem;
  modelSolution: string;
  targets: PracticeTarget[];
  text: string;
}): { systemPrompt: string; prompt: string } {
  const systemPrompt = header(`TAREFA: JULGAR UMA RESPOSTA ENTREGUE.
- Extraia os MOVIMENTOS, não uma nota: quais proposições ele usou, em que ordem, e onde quebrou. O texto dele pode ser fala transcrita: tolere ruído de transcrição, não de conceito.
- Compare com a sua solução-modelo. Uma resposta certa por outro caminho válido é certa.
- Se estiver ERRADA: diga o veredito sem rodeios e localize a primeira quebra SEM dar a correção. Dê o menor empurrão que deixa ele fazer o próximo movimento. Uma tentativa errada nunca é motivo para revelar a correção.
- Se estiver CERTA: confirme e credite os movimentos que sustentaram a resposta, em uma linha. Não reescreva a solução: ele vai ver a sua solução-modelo em seguida.
- Nunca suavize um veredito errado nem infle um certo.
- "reply" fala com ele por "você", em 1 a 3 frases.

Responda SOMENTE em JSON:
{
  "correct": false,
  "reply": "..."
}`);
  const prompt = `${problemBlock(params.problem, params.modelSolution, params.targets)}

RESPOSTA QUE ELE ENTREGOU AGORA: "${clip(params.text, 2000)}"

Julgue em JSON:`;
  return { systemPrompt, prompt };
}

/** Answers a question during the pause that follows a concluded problem. */
export function buildPauseAnswerPrompt(params: {
  problem: PracticeProblem;
  targets: PracticeTarget[];
  question: string;
}): { systemPrompt: string; prompt: string } {
  const systemPrompt = header(`TAREFA: RESPONDER A UMA PERGUNTA NA PAUSA. O problema abaixo já foi concluído e o aluno já viu a solução-modelo.
- Responda por inteiro, mas cirurgicamente: reparos, esclarecimentos, o que a dica queria dizer, por que um movimento estava certo. Nunca reensine o tema.
- Nunca pose um problema novo dentro da resposta: o próximo só vem quando ele pedir.
- "reply" fala com ele por "você".

Responda SOMENTE em JSON:
{
  "reply": "..."
}`);
  const prompt = `${problemBlock(params.problem, params.problem.modelSolution || '', params.targets).replace(
    'PROBLEMA ATIVO',
    'PROBLEMA CONCLUÍDO'
  ).replace('(privada: o aluno ainda não a vê)', '(ele já viu)')}

Desfecho: ${params.problem.outcome}

PERGUNTA DELE: "${clip(params.question, 1500)}"

Responda em JSON:`;
  return { systemPrompt, prompt };
}
