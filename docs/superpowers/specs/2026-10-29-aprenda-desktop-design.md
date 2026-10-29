# Documento de Design: Aprenda Desktop

**Data**: 29/10/2026  
**Status**: Proposta para Aprovação  
**Tópico**: Aplicativo desktop de estudo ativo com IA para estudantes universitários (Feira de Tecnologia)

---

## 1. Visão Geral e Intenção (O "Porquê")

O **Aprenda Desktop** é um aplicativo desktop (compatível com Linux e Windows) desenvolvido em **Electron + TypeScript**, projetado para auxiliar estudantes universitários a absorverem e reterem conteúdos densos de suas disciplinas a partir de materiais em PDF.

O projeto nasce para uma demonstração de destaque em uma **feira de tecnologia da faculdade**. Diferente de chats genéricos com documentos, o Aprenda Desktop é inspirado na produtividade do Google NotebookLM, mas com um diferencial pedagógico estrito: **compreensão ativa e retenção contínua**. O objetivo não é apenas resumir textos passivamente, mas desafiar o estudante com simulados rigorosos e alimentar uma esteira de **repetição espaçada** diária focada exclusivamente em suas lacunas reais de aprendizado.

---

## 2. Metas, Não-Metas e Anti-Metas

### Metas (Goals)
1. **Gestão de Disciplinas e PDFs**: Permitir ao aluno criar disciplinas e anexar um ou múltiplos arquivos PDF em cada uma.
2. **Três Ferramentas de Estudo Distintas**:
   - **Resumos**: Opção de *Resumo Explicativo* (linguagem didática, simplificada, estilo Feynman) e *Síntese* (tópicos essenciais, direto ao ponto).
   - **Questões Avulsas**: Bateria de questões sob demanda para treino livre e rápido, sem peso no histórico diagnóstico.
   - **Simulado Diagnóstico**: Sessão estruturada em duas fases: (a) leitura prévia de tópicos cruciais gerados pela IA e (b) prova em modo fechado com gabarito comentado, alimentando o diagnóstico de dificuldades.
3. **Questões de Alto Rigor ("Estilo Concurso")**:
   - Questões estritamente de múltipla escolha.
   - Engenharia de prompt voltada a evitar vícios clássicos de LLMs: alternativas com extensão homogênea, pegadinhas conceituais legítimas e distratores baseados em confusões reais de interpretação do PDF.
   - Justificativa imediata detalhando o porquê do acerto e a razão exata de cada distrator estar errado.
4. **Repetição Espaçada Diária (100% Offline)**: Todo dia, ao abrir o app e a disciplina, o botão "Revisar Agora" reapresenta as questões que o aluno errou nos simulados anteriores, calculadas pelo algoritmo SM-2.
5. **Conexão Flexível com IA**: Suporte a roteadores de provedores (Omniroute, 9router), modelos em nuvem ou Ollama local através de um cliente padronizado compatível com a API da OpenAI.
6. **Interface Integrada em 3 Colunas**: Visualizador estilo NotebookLM onde o aluno visualiza disciplinas/PDFs à esquerda, o conteúdo do PDF no centro e o painel ativo de estudo/simulado à direita.

### Não-Metas (Non-Goals para a v1)
- **Questões Dissertativas**: Escopadas fora da primeira versão para garantir correção imediata e determinística durante a apresentação na feira.
- **Sincronização em Nuvem Multi-dispositivo**: Todo o armazenamento é 100% local na máquina do usuário.
- **OCR Pesado de Imagens Escaneadas**: O foco inicial é em PDFs textuais (materiais didáticos, artigos e apostilas com texto selecionável).

### Anti-Metas (Anti-Goals)
- **Não ser um chat aberto passivo**: O app não deve se comportar como um assistente de bate-papo solto onde o aluno apenas conversa. O foco é estudo orientado por metas, leitura e teste.
- **Não gerar questões triviais ou óbvias**: Questões com respostas óbvias ou alternativas em que a correta é a mais longa quebram o propósito de ensino do aplicativo.

---

## 3. Abordagens Consideradas e Decisão Arquitetural

### Abordagens Avaliadas
- **Abordagem 1 (Escolhida): Electron + React/Vite com Armazenamento Local Estruturado**
  - *Renderer*: React 18+ com Tailwind CSS empacotado via Vite. Gerencia o layout reativo de 3 colunas, abas de estudo, renderização do PDF e cards de questões com agilidade.
  - *Main Process*: Node.js no Electron gerenciando extração de texto de PDFs (`pdf-parse` / `pdfjs-dist`), persistência em banco local (SQLite / armazenamento estruturado) e comunicação IPC segura via `preload.ts` (`contextBridge`).
  - *Comunicação IA*: Serviço HTTP padronizado usando a especificação OpenAI (baseURL + apiKey configuráveis).
  - *Trade-off*: Exige a montagem do bundle Vite/React, mas oferece extrema produtividade, componentes reutilizáveis, excelente performance de renderização e estabilidade na apresentação ao vivo.
- **Abordagem 2 (Descartada): Electron Minimalista com Vanilla TypeScript e JSON**
  - *Motivo do descarte*: A manipulação manual do DOM para uma interface complexa de 3 colunas geraria código excessivamente verboso, frágil e sujeito a erros visuais na feira.
- **Abordagem 3 (Descartada): Pipeline RAG Pesado com Embeddings Locais**
  - *Motivo do descarte*: Gerar embeddings e busca vetorial local em tempo real consumiria muita CPU/RAM e adicionaria latência indesejada durante a demonstração na feira.

---

## 4. Arquitetura Detalhada e Decisões de Produto

### 4.1 Layout da Interface (Padrão NotebookLM - 3 Colunas)
1. **Coluna Esquerda (Navegação & Repetição Diária)**:
   - Seletor de Disciplinas com botão "+ Nova Disciplina".
   - Lista de PDFs vinculados à disciplina ativa com botão "+ Adicionar PDF".
   - Card/Badge destacado de **Revisão Espaçada do Dia**: exibe o número de questões pendentes para reter hoje naquela disciplina com botão "Revisar Agora".
2. **Coluna Central (Visualização e Leitura)**:
   - Leitor/visualizador do material da disciplina ou texto-base gerado pela IA.
   - Durante a Fase 1 do *Simulado*, exibe a leitura preparatória dos tópicos essenciais extraídos do PDF.
   - Durante a Fase 2 do *Simulado* (Modo Prova), o texto de apoio fica temporariamente oculto para estimular a evocação ativa (evitar cola direta).
3. **Coluna Direita (Painel de Estudo Ativo)**:
   - Seletor de abas: `[ Resumos ]` | `[ Questões ]` | `[ Simulado ]`.
   - Aba **Resumos**: Alternância entre "Resumo Explicativo" e "Síntese em Tópicos".
   - Aba **Questões**: Campo para escolher tópico ou pedir bateria rápida de fixação.
   - Aba **Simulado**: Exibição da questão atual (estilo concurso, alternativas A, B, C, D), botões de seleção de resposta, confirmação e posterior exibição do gabarito comentado.

### 4.2 Mecânica da Repetição Espaçada (SRS - Anki Style)
- **Origem das Questões de Revisão**: O botão "Revisar Agora" reaproveita as **mesmas questões objetivas** que o aluno errou nos simulados anteriores, armazenadas localmente no banco de dados.
- **Vantagens na Apresentação**: 100% offline, resposta instantânea, zero consumo de tokens e sem risco de falha de conexão ou lentidão de LLM durante a feira.
- **Cálculo de Intervalo (SM-2 Simplificado)**:
  - Erro no simulado ou na revisão: agenda para o dia seguinte (`interval = 1`, `consecutiveCorrect = 0`).
  - Acerto na revisão: aumenta o intervalo exponencialmente (`interval = interval * easeFactor`, default 2.0).

### 4.3 Ingestão de PDFs e Janela de Contexto
- A geração de resumos e simulados atua sobre o **PDF ativo selecionado** na coluna esquerda.
- No processo Main, o texto extraído é fatiado em seções/blocos respeitando o limite de contexto do modelo configurado (ex: ~4k-8k tokens seguros para Ollama `llama3:8b` ou modelos via API).

### 4.4 Modelo de Dados e Persistência Local
Armazenamento local gerenciado no processo Main do Electron (`userData`):
- **Discipline**: `id`, `name`, `color`, `createdAt`.
- **Document**: `id`, `disciplineId`, `fileName`, `filePath`, `extractedText`, `createdAt`.
- **Question**: `id`, `disciplineId`, `documentId`, `topic`, `statement`, `options` (array de `{ id, text, isCorrect, explanation }`), `explanationGeneral`, `sourceType` ('simulado' | 'avulsa').
- **UserPerformance**:
  - `questionId`, `lastReviewedAt`, `nextReviewAt`, `intervalDays`, `repetitionCount`, `consecutiveCorrect`, `easeFactor`, `lastScore`.

### 4.5 Integração com Provedores de IA
- Modal de configurações com persistência segura:
  - `Base URL` (Ex: `https://api.omniroute.io/v1`, `https://api.9router.com/v1`, `http://localhost:11434/v1`).
  - `API Key`.
  - `Model Name`.
- Geração via JSON Schema estruturado para garantir alternativas homogêneas e explicações detalhadas por item.

---

## 5. Chamadas Feitas pelo Construtor (Builder Calls)
1. **Modo Prova Fechado no Simulado**: Durante as perguntas do simulado, o texto de leitura prévia é recolhido na coluna central para estimular a evocação ativa real do aluno, voltando a ficar visível junto com o gabarito.
2. **Diagnóstico sem Gráficos Pesados**: O mapa de dificuldades é apresentado diretamente no encerramento do simulado (taxa de acerto global e tópicos onde houve erro) e no card lateral de revisão diária, mantendo o app leve e sem dependências pesadas de gráficos.
3. **Contexto por PDF Ativo**: As ferramentas operam no PDF selecionado no momento, permitindo estudo focado por documento.
