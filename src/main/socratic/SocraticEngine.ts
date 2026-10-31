import { CheckQuestionData, ConceptNode } from '../../shared/types';
import { buildSocraticTeachPrompt } from '../prompts/surgicalGeneratorPrompt';
import { callLLM } from '../services/llmClient';

export class SocraticEngine {
  private currentNode?: ConceptNode;

  async generatePredictStep(node: ConceptNode): Promise<{ questionText: string; promptGoal: string }> {
    this.currentNode = node;

    // Curated motivating prediction nudges anchored in Principle II ("How could I have discovered this?")
    const predictPrompts: Record<string, string> = {
      'osi-l3-ttl':
        'Imagine que dois roteadores têm rotas defeituosas apontando um para o outro em loop fechado. Se um pacote entrar nesse ciclo sem intervenção, o que aconteceria fisicamente com os enlaces da rede e que regra você criaria para resolver isso?',
      'osi-l3-ip-packets':
        'Se você precisasse enviar uma carta atravessando 4 transportadoras diferentes que trocam de envelope a cada cidade, você trocaria o endereço do destinatário final em cada cidade ou manteria o mesmo endereço na carta interna?',
      'osi-l3-routers-vs-switches':
        'Em um prédio com 5.000 computadores ligados num único domínio, um único vírus emitindo broadcast contínuo paralisaria todas as máquinas. Como você dividiria essa rede para que o broadcast ficasse restrito a um andar?',
      'osi-l3-arp':
        'Seu computador conhece o endereço IP lógico de um servidor na mesma sala, mas a placa de rede só transmite para endereços físicos MAC. Como seu computador pode descobrir o endereço MAC desse servidor sem configuração manual?',
      'osi-l3-routing-table':
        'Se a sua tabela de rotas indicar dois caminhos possíveis para um destino, um com máscara mais geral /16 e outro com máscara mais detalhada /28, qual caminho oferece menor chance de entregar o pacote para a máquina errada?',
    };

    const questionText =
      predictPrompts[node.id] ||
      `Diante do desafio tratado em "${node.title}", como você deduziria a solução para o problema: ${node.summary}? O que deve acontecer para garantir a integridade da comunicação?`;

    return {
      questionText,
      promptGoal: 'Preveja o comportamento do sistema antes de revelarmos o protocolo oficial.',
    };
  }

  async submitPrediction(studentPrediction: string): Promise<{ teachProse: string; checkQuestion?: CheckQuestionData }> {
    const node = this.currentNode;
    if (!node) {
      throw new Error('Nenhum conceito ativo selecionado para o ciclo socrático.');
    }

    // Try calling LLM for customized teaching prose connecting to student's prediction
    try {
      const { systemPrompt, prompt } = buildSocraticTeachPrompt(node, studentPrediction);
      const raw = await callLLM({
        systemPrompt,
        prompt,
        temperature: 0.2,
        jsonMode: true,
      });

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.teachProse) {
          return {
            teachProse: parsed.teachProse,
            checkQuestion: parsed.checkQuestion,
          };
        }
      }
    } catch (_err) {
      // Offline fallback
    }

    // High quality deterministic fallback anchored in Principle I & II
    const teachProse = `Princípio Fundamental: ${node.unconditionalTruth}\n\nConexão com sua intuição: Ao analisar "${studentPrediction}", perceba como a arquitetura de redes resolve esse impasse de forma estrita. No caso de ${node.title}, não se trata de tentar adivinhar ou retransmitir infinitamente; o protocolo estabelece que ao atingir a condição de limite, o pacote é imediatamente descartado com emissão de diagnóstico para proteger toda a infraestrutura.`;

    return { teachProse };
  }

  async generateCheckQuestion(node: ConceptNode): Promise<CheckQuestionData> {
    this.currentNode = node;

    const checkBank: Record<string, CheckQuestionData> = {
      'osi-l3-ttl': {
        questionText: 'Se um pacote IPv4 chega a um roteador intermediário com TTL = 1, qual é a ação mandatória executada pelo roteador?',
        options: [
          'Decrementa para 0, descarta o pacote e envia ICMP Time Exceeded (Tipo 11)',
          'Encaminha o pacote e avisa o próximo salto para descartar',
          'Restaura o TTL para 64 e retransmite para a origem',
          'Envia o pacote em broadcast para tentar encontrar uma rota alternativa',
        ],
        correctOptionIndex: 0,
        explanation: 'O decremento do TTL é compulsório em cada salto L3. Ao alcançar 0, o descarte imediato evita saturação por loops.',
      },
      'osi-l3-ip-packets': {
        questionText: 'Ao longo do trânsito de um pacote IP por múltiplos roteadores na Internet, o que acontece com os endereços IP de origem e destino contidos no cabeçalho?',
        options: [
          'Permanecem rigorosamente idênticos de ponta a ponta (salvo em caso de NAT)',
          'São substituídos a cada salto pelos IPs das interfaces dos roteadores',
          'O IP de origem vira o IP do roteador e o de destino é descartado',
          'São criptografados e convertidos para endereços MAC',
        ],
        correctOptionIndex: 0,
        explanation: 'O pacote IP representa a comunicação lógica fim-a-fim; apenas os cabeçalhos de enlace (MAC) são reescritos em cada salto.',
      },
      'osi-l3-routing-table': {
        questionText: 'Quando um roteador encontra duas rotas coincidentes para um mesmo IP na tabela (uma /24 e outra /28), qual critério define a rota vencedora?',
        options: [
          'A rota com a máscara mais específica (/28), pelo Longest Prefix Match',
          'A rota mais antiga gravada na memória RAM',
          'A rota com menor número de bits 1 na máscara (/24)',
          'Ambas são descartadas por conflito de rotas',
        ],
        correctOptionIndex: 0,
        explanation: 'O princípio do Casamento Mais Longo de Prefixo garante que a rota mais detalhada e específica sempre tenha prioridade.',
      },
    };

    if (checkBank[node.id]) {
      return checkBank[node.id];
    }

    return {
      questionText: `Com base no que foi ensinado sobre ${node.title}, qual afirmação expressa a verdade incondicional desse conceito?`,
      options: [
        node.unconditionalTruth,
        'O protocolo permite retransmissões infinitas em qualquer camada',
        'A informação é comutada apenas por broadcast na camada física',
        'Os roteadores nunca alteram campos de cabeçalho',
      ],
      correctOptionIndex: 0,
      explanation: node.unconditionalTruth,
    };
  }

  evaluateCheck(studentAnswerIndex: number, checkData: CheckQuestionData): { isPassed: boolean; repairExplanation?: string } {
    const isPassed = studentAnswerIndex === checkData.correctOptionIndex;
    if (isPassed) {
      return { isPassed: true };
    }

    const correctOptionText = checkData.options[checkData.correctOptionIndex] || 'Alternativa correta';
    const repairExplanation = `Reparo Diagnóstico Cirúrgico: A alternativa correta é "${correctOptionText}". Motivo: ${checkData.explanation} (Avançando para o próximo degrau sem retenção em loop).`;

    return {
      isPassed: false,
      repairExplanation,
    };
  }
}
