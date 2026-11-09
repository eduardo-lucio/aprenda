import type { CallLLMOptions } from '../../src/main/services/llmClient';
import { CognitiveJudgeService } from '../../src/main/services/CognitiveJudgeService';

/** Judge backed by the deterministic mock (no network). */
export const mockJudge = () => new CognitiveJudgeService(mockLLM);

/** Deterministic stand-in for the AI provider, used by tests (no network, no templates in src). */
export async function mockLLM(options: CallLLMOptions): Promise<string> {
  const sys = options.systemPrompt || '';

  if (sys.includes('Orientador Pedagógico')) {
    return JSON.stringify({
      agentThinking: 'Tema de redes; separo em recortes.',
      question: 'O que exatamente você quer aprender sobre Redes? Escolha a opção que melhor descreve seu objetivo:',
      options: [
        'Modelo OSI e TCP/IP (camadas, encapsulamento)',
        'Endereçamento IP e sub-redes (CIDR, máscaras)',
        'TCP vs UDP (handshake, controle de fluxo)',
        'Roteamento (tabelas, TTL, ICMP)',
        'DNS e DHCP',
        'HTTP e TLS',
        'Segurança de redes (firewalls, NAT)',
        'Diagnóstico (ping, traceroute, Wireshark)',
        'Outro / não sei ainda — quero orientação',
      ],
    });
  }

  if (sys.includes('Arquiteto Curricular')) {
    const mk = (id: string, title: string, level: number, prerequisites: string[]) => ({
      id, title, summary: `${title}.`, level, prerequisites, unconditionalTruth: `${title} é verdadeiro.`,
    });
    const nodes = [
      mk('n1', 'Modelo de camadas', 1, []),
      mk('n2', 'Endereçamento', 1, []),
      mk('n3', 'Portas e sockets', 2, ['n1']),
      mk('n4', 'Handshake TCP', 2, ['n1', 'n2']),
      mk('n5', 'Controle de fluxo', 3, ['n4']),
      mk('n6', 'Datagramas UDP', 3, ['n3']),
      mk('n7', 'Controle de congestionamento', 4, ['n5']),
      mk('n8', 'Escolha de protocolo', 4, ['n5', 'n6']),
    ];
    return JSON.stringify({
      discipline: 'Redes',
      agentThinking: 'Grafo de dependências.',
      nodes,
      firstQuestion: {
        nodeId: 'n7',
        questionText: 'O que o TCP faz ao detectar perda de segmentos?',
        options: ['Reduz a janela de congestionamento', 'Aumenta a taxa de envio', 'Troca de porta', 'Reinicia o handshake'],
        correctOptionIndex: 0,
        anchorConcept: 'Controle de congestionamento',
        difficulty: 4,
      },
    });
  }

  if (sys.includes('Juiz Cognitivo')) {
    const p = options.prompt || '';
    const correct = /É correta: true\)/.test(p);
    const own = /Alternativa Escolhida: \[Resposta própria/.test(p);
    // Own answer: the written text decides (the word ERRADO in it marks a wrong claim)
    const verdict = own ? (/ERRADO/.test(p) ? 'blind_spot' : 'mastered') : correct ? 'mastered' : 'frontier';
    return JSON.stringify({
      agentThinking: 'Avalio a evidência do aluno.',
      verdict,
      isCorrectOption: correct,
      reasoningDiagnosis: 'Diagnóstico de teste.',
    });
  }

  // Probe question generator
  return JSON.stringify({
    agentThinking: 'Gero uma questão.',
    questionText: `Pergunta ${Math.random().toString(36).slice(2, 8)} sobre o conceito?`,
    options: ['A correta', 'B errada', 'C errada', 'D errada'],
    correctOptionIndex: 0,
    anchorConcept: 'Conceito',
    difficulty: 2,
    // Plan, prediction and lesson calls read their own fields from this same answer
    plan: 'Plano de teste.',
    promptGoal: 'Preveja o comportamento.',
    teachProse: 'Explicação de teste.',
    checkQuestion: {
      questionText: 'Pergunta de verificação?',
      options: ['Certa', 'Errada 1', 'Errada 2', 'Errada 3'],
      correctOptionIndex: 0,
      explanation: 'Porque sim.',
    },
  });
}

/** Keeps the alternatives in the order the mock wrote them, so tests know where the right one is. */
export const noShuffle = () => 0.9999;
