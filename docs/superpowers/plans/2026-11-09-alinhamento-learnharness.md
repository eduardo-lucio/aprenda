# Plano: alinhar o APRENDA ao LearnHarness, uma etapa por vez

**Data:** 9 nov 2026
**Base:** relatório de comparação (https://claude.ai/artifact/6YXAeBJfuLMj411G84Uvjz), IDs A1–A8, D1–D7, P1–P8.
**Referência do LearnHarness:** clone local em `~/.cache/learnharness-ref` (v0.5.0, commit `713377f`).

## Como o plano funciona

- Cada etapa é uma entrega completa: código, prompts, testes e textos PT/EN. Só começo a seguinte depois de você conferir a anterior.
- Cada etapa termina com um commit próprio na branch `feat/alinhamento-learnharness`.
- Uma etapa está pronta quando: `npx vitest run --dir tests` passa (hoje: 291 testes), `npm run typecheck` e `npm run lint` passam, o fluxo roda no app com a API simulada (`src/renderer/dev/mockApi.ts`) e sessões salvas por versões anteriores continuam abrindo.
- Teste com provedor real fica com você: eu não digito chaves de API. Em cada etapa digo o que vale a pena conferir com um modelo de verdade.
- Em cada etapa que toca prompts, o texto do LearnHarness removido por falta do recurso volta para o arquivo, e as regras próprias do APRENDA (tom, "você", não nomear a máquina) ficam.

## O que fica de fora

| Item | Motivo |
|---|---|
| D1: trocar a máquina de estados por agentes com ferramentas | Decisão de design do APRENDA. O alinhamento é de método, não de arquitetura. As etapas abaixo dão à máquina os passos que faltam. |
| D5 e D6: status por conceito e juiz de quatro veredictos | Contribuição própria do APRENDA. Ficam. |
| A4 pesquisa web, A6 demos interativas, anotação de imagens | Dependem de subagentes e ferramentas que a arquitetura não tem. |
| A8 atualizador e macOS, P5 assinaturas, P6 editor de prompts, P7 custo | Não afetam o método de ensino. Podem virar plano próprio. |

## Decisões que preciso de você

1. **Licença (etapa 1).** Recomendo adotar AGPL-3.0 com atribuição. Reescrever os prompts com texto próprio contradiz o objetivo deste plano, que copia mais texto do LearnHarness a cada etapa. Hoje o README diz "Propriedade privada".
2. **Direção da sondagem (etapa 2).** Recomendo seguir o LearnHarness: entrar perto do topo e descer a cada erro.
3. **Mermaid (etapa 8).** Em 8 nov você decidiu "Markdown sem Mermaid". Alinhar exige reverter isso. Deixei como opcional no fim.

---

## Etapa 0: preparar o terreno

**Esforço:** baixo. Sem mudança de comportamento.

- Fazer commit do trabalho pendente em `fix/auditoria-2026-11`: 40 arquivos modificados e 14 novos (notas por conceito, ditado ao vivo, grafo por forças, ícone). Os testes desse trabalho passam.
- Corrigir a execução dos testes: `npx vitest run` hoje também roda a cópia em `.claude/worktrees/happy-blackburn-e401fe` e acusa 92 falhas que não são do projeto. Acrescentar `exclude` em `vitest.config.ts`.
- Decidir o destino do commit `e6dd963` (Vite 8 e Vitest 5), que existe só na branch `claude/happy-blackburn-e401fe`.
- Criar `feat/alinhamento-learnharness` a partir daí.

**Pronto quando:** `npm test` roda só `tests/` e passa; árvore de trabalho limpa.

## Etapa 1: licença e atribuição

**Esforço:** baixo. Bloqueia qualquer distribuição dos instaladores.

- Adicionar `LICENSE` (AGPL-3.0) e `"license": "AGPL-3.0-or-later"` no `package.json`.
- Adicionar `NOTICE` com o crédito ao LearnHarness e a lista dos 15 prompts: 7 idênticos, 8 adaptados.
- Trocar a seção "Licença" do README e acrescentar a origem do projeto.
- Incluir `LICENSE` e `NOTICE` nos instaladores (`extraResources` em `package.json`).
- Mostrar licença e crédito em Configurações (`SettingsModal.tsx`), com link para o código-fonte.

**Pendência sua:** a AGPL pede o código-fonte disponível para quem recebe o app. O repositório não tem remoto configurado.

## Etapa 2: sondagem (D3)

**Esforço:** baixo a médio.

O que já existe em `SessionStateMachine.processProbeAnswer`: um acerto marca os pré-requisitos como dominados e um erro puxa os pré-requisitos para a frente da fila. Falta a entrada pelo topo e um critério de parada que meça piso e teto.

- **Entrada perto do topo.** `submitGoalClarification` ordena por nível crescente e pede a primeira pergunta sobre a base. Passa a abrir no conceito mais alto que o objetivo exige. `buildGraphPrompt` e `buildProbeQuestionPrompt` acompanham.
- **Inferência para cima.** Um erro num conceito coloca os dependentes acima do teto: eles não são sondados e contam como localizados.
- **Critério de parada.** `calculateFrontierClarity` deixa de ser "porcentagem de conceitos testados" e passa a ser "porcentagem de conceitos com posição conhecida": testado, dominado por inferência ou acima de um teto. O mínimo de perguntas configurável continua.
- **Fio que não quebra.** Se o topo é dominado, a próxima pergunta sobre ele sobe a dificuldade, com limite de tentativas.
- **Resumo da sondagem.** Ao entrar no plano, registrar por fio o piso, o teto e os equívocos encontrados, e entregar isso a `generatePlan`. Equivale ao `probe_done`.
- **Prompt.** `prompts/prober/10-probe-doctrine.md` recupera "enter near the top", os fios e "a strand that never breaks is not done". A leitura do grafo persistente volta na etapa 6.

**Testes:** `SessionStateMachine.test.ts` e `pedagogy.test.ts`: ordem de entrada, inferência nos dois sentidos, parada com piso e teto, escalada no topo.
**Conferir com modelo real:** se as perguntas de abertura saem difíceis o bastante sem assustar quem está vendo o tema pela primeira vez.

## Etapa 3: vários passos por conceito (D2 e A7)

**Esforço:** médio. É onde o APRENDA mais se afasta da teoria que adota.

Hoje cada conceito roda palpite, um texto de até 150 palavras e uma verificação. Um erro devolve o conceito à fila.

- **Passos.** Depois do palpite, o professor declara de 1 a 4 passos para o conceito. Cada passo é gerado sob demanda, com os anteriores como contexto, e traz texto mais verificação.
- **Erro refaz o passo.** Uma verificação errada gera nova explicação do mesmo passo a partir do diagnóstico do juiz, e depois outra verificação. Limite de 2 repetições por passo; passado o limite, o conceito volta à fila como hoje. O limite mantém a previsibilidade que o design quer.
- **Domínio.** O conceito só fica dominado quando todos os passos foram demonstrados.
- **Canal "pensando enquanto lia" (A7).** A verificação ganha um segundo campo opcional, separado do raciocínio sobre a pergunta. O juiz e a próxima explicação recebem os dois sem misturar.
- **Arquivos:** `SocraticEngine.ts`, `surgicalGeneratorPrompt.ts`, `registerIpcHandlers.ts` (`session:submit-prediction`, `session:submit-check`), `SessionStateMachine.recordCheckVerdict`, `SocraticCard.tsx`, `SessionView.tsx`, `shared/types.ts` (`activeLesson` com passo atual; `CompletedLesson` com lista de passos), `mockApi.ts`.
- **Prompt.** `prompts/teacher/20-teaching.md` perde "One step, one check… the lesson moves on" e recupera o trecho de reparo durante a aula. `shared/20-question-tools.md` recupera o canal de leitura.

**Testes:** `SocraticEngine.test.ts`, `ipcHandlers.test.ts`, `SessionRecovery.test.tsx` (retomar no meio de um passo), `SessionView.test.tsx`.
**Conferir com modelo real:** se o modelo divide bem um conceito em passos e não estoura o limite de palavras por passo.

## Etapa 4: plano que muda durante as aulas (D4)

**Esforço:** médio. Depende do diagnóstico por passo da etapa 3.

- **Revisão do plano.** Nova chamada `revisePlan` em `CurriculumGenerator`: recebe o mapa, a ordem e as falhas recentes, e devolve conceitos a acrescentar, conceitos a podar e uma frase para o aluno.
- **Quando roda.** Depois que um passo estoura o limite de repetições (fundação faltando) e quando o palpite mostra domínio de um conceito ainda não ensinado (poda, confirmada por uma verificação curta).
- **Validação.** A máquina aceita no máximo 2 conceitos novos por revisão, passa tudo por `sanitizeGraph`, recusa ciclos e recalcula níveis e `teachingOrder`.
- **Interface.** Aviso curto na conversa ("Acrescentei X antes de Y porque…") e o mapa se atualiza. `KnowledgeGraph.tsx` e `forceLayout.ts` precisam acomodar nós novos sem embaralhar o resto.
- **Prompt.** `prompts/teacher/10-planning.md` recupera a ideia de plano como hipótese reescrita durante a aula.

**Fica de fora:** gerar o mapa só depois da sondagem. A sondagem do APRENDA é feita sobre o mapa, e mudar isso é mudar D1.
**Testes:** `SessionStateMachine.test.ts` (acréscimo, poda, ciclo recusado, limite), `KnowledgeGraph.test.tsx`.

## Etapa 5: Prática (A1)

**Esforço:** alto. É a quarta fase do LearnHarness e a maior ausência. Vou dividir em três entregas.

**5a. Um problema de ponta a ponta.**
- Nova fase `practice` na máquina de estados e um `PracticeEngine` ao lado do `SocraticEngine`.
- Problema com solução-modelo fixada antes de mostrar. A solução fica no processo principal e só vai para a tela na conclusão.
- Envio de raciocínio em andamento ou de resposta final. Dicas pela escada R0–R5, um degrau por pedido. Veredicto que localiza o primeiro erro sem dar a correção.
- Conclusão revela a solução. O próximo problema só vem quando o aluno pede.
- `promptLoader.ts` passa a carregar `practice/00-base.md` e `practice/10-doctrine.md`. Tirar `!practice/**` do `extraResources`.

**5b. A sequência.**
- Três modos em ordem (recordar, discriminar, compor), alvos intercalados, dificuldade ajustada pelo degrau de dica que o problema precisou.
- Abertura com 1 a 3 problemas leves e fechamento retestando, com outra roupagem, tudo o que falhou.

**5c. Entrada.**
- Botão de prática a partir de uma sessão com conceitos dominados, e prática livre a partir de um tema descrito. `App.tsx:312` hoje fixa `'teaching'`.
- A barra lateral distingue sessões de ensino e de prática.

**Adaptação necessária:** os prompts de prática foram escritos para ferramentas (`problem`, `conclude`). No APRENDA cada uma vira uma chamada com JSON validado, como nas outras fases. O texto da doutrina fica igual; o que muda é um bloco curto de mecânica.
**Testes:** arquivo novo `PracticeEngine.test.ts`, mais `SessionStateMachine.test.ts`, `ipcHandlers.test.ts`, `sessionIsolation.test.ts` e testes de tela.

## Etapa 6: memória entre sessões (A2)

**Esforço:** médio a alto.

- **Registro persistente.** Arquivo próprio em `userData`, ao lado de `sessions.json`, com o que foi demonstrado: conceito, verdade incondicional, sessão de origem e data. Escrita atômica, como `SessionRepository`.
- **Gravação.** Ao dominar um conceito numa aula ou acertar um problema de prática.
- **Leitura pela sondagem.** O sondador recebe o que o aluno já demonstrou em temas próximos e não abre abaixo disso. É o item "Read his persistent map" do prompt original.
- **Leitura pela prática.** A prática pode partir de conceitos de sessões anteriores.
- **Cuidado (D5).** O registro guarda o que foi demonstrado e quando, não um selo de "dominado para sempre". A sondagem trata como ponto de partida a confirmar, não como certeza.
- **Interface.** Uma tela simples para ver e apagar o que está guardado.

**Fica de fora:** extrator e auditor de proposições por subagentes, e importação de notas.
**Testes:** arquivo novo para o registro; `SessionStateMachine.test.ts` para a leitura.

## Etapa 7: material do aluno (A3)

**Esforço:** médio.

- Anexar arquivos de texto, Markdown e PDF ao criar a sessão. Extração de texto no processo principal.
- O texto entra como contexto na orientação de escopo, no mapa, nas aulas e na prática, com limite de tamanho por chamada.
- Proteção de caminhos: só arquivos escolhidos pelo aluno no seletor do sistema, sem leitura por caminho digitado.
- `prompts/shared/30-learner-files.md` entra adaptado.

**Risco:** PDFs de slides costumam ter pouco texto e muita imagem. A primeira versão só lê texto e avisa quando o arquivo quase não tem.

## Etapa 8: opcionais

Cada um é independente e pode ser feito em qualquer ponto depois da etapa 1.

- **Mermaid (A5 e D7).** Renderizar blocos Mermaid em `RichText.tsx` e liberar em `shared/40-formatting.md`. Reverte a sua decisão de 8 nov.
- **Modelo separado para o juiz (P5).** O juiz roda a cada resposta; um modelo barato reduz custo sem tocar nas aulas.
- **Recordação livre (P4).** Um modo de pergunta sem alternativas, corrigido contra uma resposta fixada antes.
- **Atalho global de ditado (P8).**

---

## Ordem e dependências

```
0 preparar → 1 licença → 2 sondagem → 3 passos → 4 plano vivo → 5 prática → 6 memória → 7 material
                                         └────────────┘              └──────────┘
                                    4 usa o diagnóstico de 3    6 alimenta 2 e 5
```

A ordem segue o caminho do aluno na sessão: cada etapa melhora o que a seguinte recebe. Se você preferir a Prática antes, as etapas 5a–5c só dependem da 0 e da 1.
