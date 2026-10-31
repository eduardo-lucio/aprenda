import { QuestionData } from '../../shared/types';

export const DEFAULT_QUESTION_BANK: Record<string, QuestionData[]> = {
  'osi-l1-bits': [
    {
      id: 'q-l1-1',
      nodeId: 'osi-l1-bits',
      questionText: 'Em uma transmissão cabeada Ethernet 1000BASE-T, qual é a unidade fundamental manipulada pelos transceptores físicos no meio de transmissão?',
      options: [
        'Sinais eletromagnéticos representando bits binários sem reconhecimento de endereços',
        'Quadros com preâmbulo e endereços MAC de origem e destino',
        'Pacotes com cabeçalho de 20 bytes contendo TTL',
        'Datagramas associados a portas lógicas TCP',
      ],
      correctOptionIndex: 0,
      anchorConcept: 'Sinais brutos e bits na Camada Física',
      difficulty: 1,
    },
  ],
  'osi-l2-mac': [
    {
      id: 'q-l2-1',
      nodeId: 'osi-l2-mac',
      questionText: 'Quando um switch Ethernet recebe um quadro destinado a um endereço MAC que não consta em sua tabela CAM (MAC Address Table), qual é o seu comportamento?',
      options: [
        'Encaminha o quadro por flooding (inundação) para todas as portas ativas, exceto a porta de origem',
        'Descarta o quadro imediatamente e envia um pacote ICMP Destination Unreachable',
        'Armazena o pacote em buffer e emite uma requisição ARP para a rede local',
        'Substitui o MAC de destino pelo MAC do gateway padrão e encaminha',
      ],
      correctOptionIndex: 0,
      anchorConcept: 'Comutação de quadros e domínio de broadcast L2',
      difficulty: 2,
    },
  ],
  'osi-l3-ip-packets': [
    {
      id: 'q-l3-ip-1',
      nodeId: 'osi-l3-ip-packets',
      questionText: 'Durante a travessia de um pacote IPv4 por três roteadores ao longo do caminho até o destino, o que ocorre com os endereços IP e MAC nos cabeçalhos?',
      options: [
        'Os endereços IP de origem e destino permanecem inalterados; os endereços MAC mudam a cada salto',
        'Tanto os endereços IP quanto os endereços MAC mudam a cada salto para refletir o gateway',
        'Os endereços MAC permanecem os mesmos de ponta a ponta; os endereços IP são recalculados',
        'O endereço IP de origem é substituído pelo IP da interface de saída de cada roteador',
      ],
      correctOptionIndex: 0,
      anchorConcept: 'Persistência fim-a-fim de endereços IP vs reescrita L2',
      difficulty: 2,
    },
  ],
  'osi-l3-ipv4-addressing': [
    {
      id: 'q-l3-addr-1',
      nodeId: 'osi-l3-ipv4-addressing',
      questionText: 'O que define rigorosamente a fronteira entre a porção de rede e a porção de host em um endereço IPv4 moderno?',
      options: [
        'A máscara de sub-rede através de uma operação booleana AND bit a bit',
        'A classe tradicional do endereço baseada nos bits iniciais (Classe A, B ou C)',
        'O valor fixo do último octeto do endereço IP',
        'A tabela de endereços físicos mantida pelo switch de acesso',
      ],
      correctOptionIndex: 0,
      anchorConcept: 'Estrutura hierárquica e máscara de rede IPv4',
      difficulty: 2,
    },
  ],
  'osi-l3-arp': [
    {
      id: 'q-l3-arp-1',
      nodeId: 'osi-l3-arp',
      questionText: 'Quando o Host A (192.168.1.10) deseja enviar um pacote para o Host B (8.8.8.8 na Internet), qual é o alvo de sua requisição ARP na rede local?',
      options: [
        'O endereço IP do seu Gateway Padrão (Default Gateway)',
        'O endereço IP 8.8.8.8 diretamente em broadcast',
        'O servidor DNS configurado na interface',
        'Nenhum, pois o ARP só é utilizado para tráfego UDP',
      ],
      correctOptionIndex: 0,
      anchorConcept: 'Resolução ARP em tráfego inter-redes',
      difficulty: 2,
    },
  ],
  'osi-l3-ttl': [
    {
      id: 'q-l3-ttl-1',
      nodeId: 'osi-l3-ttl',
      questionText: 'Um roteador recebe um pacote IPv4 com o campo Time-to-Live (TTL) igual a 1. O que acontece com o pacote?',
      options: [
        'O roteador decrementa o TTL para 0, descarta o pacote e envia uma mensagem ICMP Time Exceeded (Type 11) à origem',
        'O roteador decrementa o TTL para 0 e o encaminha, pois o descarte só ocorre no valor negativo',
        'O pacote é devolvido intacto ao remetente com aviso de erro em camada 2',
        'O roteador renova o TTL para o valor padrão de 64 e retransmite o pacote',
      ],
      correctOptionIndex: 0,
      anchorConcept: 'Mecanismo de decremento e descarte de TTL no roteador',
      difficulty: 3,
    },
    {
      id: 'q-l3-ttl-2',
      nodeId: 'osi-l3-ttl',
      questionText: 'Por que o protocolo IPv4 exige que o checksum do cabeçalho IP seja recalculado obrigatoriamente em cada roteador pelo caminho?',
      options: [
        'Porque o campo TTL é decrementado em 1 a cada salto, alterando o conteúdo do cabeçalho',
        'Porque os dados da camada de transporte são reordenados pelo roteador',
        'Porque o endereço IP de destino é atualizado com o IP do próximo salto',
        'Porque a porta TCP de origem muda dinamicamente na comutação',
      ],
      correctOptionIndex: 0,
      anchorConcept: 'Relação entre TTL e IP Header Checksum',
      difficulty: 3,
    },
  ],
  'osi-l3-routers-vs-switches': [
    {
      id: 'q-l3-rs-1',
      nodeId: 'osi-l3-routers-vs-switches',
      questionText: 'Qual é a principal distinção arquitetural entre um Switch L2 convencional e um Roteador L3 ao receber um quadro broadcast (FF:FF:FF:FF:FF:FF)?',
      options: [
        'O switch replica o broadcast para todas as outras portas de sua VLAN; o roteador descarta o broadcast e não propaga para outras redes',
        'O switch descarta o broadcast; o roteador retransmite para toda a Internet',
        'Ambos retransmitem broadcasts da mesma forma sem distinção de camada',
        'O switch altera o IP de destino para unicast; o roteador rejeita a conexão TCP',
      ],
      correctOptionIndex: 0,
      anchorConcept: 'Isolamento de domínios de broadcast por roteadores L3',
      difficulty: 2,
    },
  ],
  'osi-l3-routing-table': [
    {
      id: 'q-l3-rt-1',
      nodeId: 'osi-l3-routing-table',
      questionText: 'Um roteador possui na sua tabela de roteamento as rotas: 10.0.0.0/8, 10.1.0.0/16 e 10.1.2.0/24. Ao receber um pacote para o IP 10.1.2.55, qual rota é escolhida?',
      options: [
        'A rota 10.1.2.0/24, pelo princípio do Casamento Mais Longo de Prefixo (Longest Prefix Match)',
        'A rota 10.0.0.0/8, pois foi a primeira adicionada e possui maior abrangência',
        'O roteador divide o tráfego igualmente entre as três rotas por balanceamento ECMP',
        'O pacote é descartado por duplicidade de rotas conflitantes',
      ],
      correctOptionIndex: 0,
      anchorConcept: 'Longest Prefix Match (LPM) em tabelas de rotas',
      difficulty: 3,
    },
  ],
  'osi-l3-subnet-cidr': [
    {
      id: 'q-l3-cidr-1',
      nodeId: 'osi-l3-subnet-cidr',
      questionText: 'Dada a rede 192.168.10.0/26, quantos endereços IP utilizáveis para hosts válidos existem nessa sub-rede e qual é sua máscara decimal?',
      options: [
        '62 hosts utilizáveis, com máscara 255.255.255.192',
        '64 hosts utilizáveis, com máscara 255.255.255.128',
        '30 hosts utilizáveis, com máscara 255.255.255.224',
        '126 hosts utilizáveis, com máscara 255.255.255.192',
      ],
      correctOptionIndex: 0,
      anchorConcept: 'Cálculo de sub-rede e máscara CIDR /26',
      difficulty: 3,
    },
  ],
  'osi-l3-fragmentation': [
    {
      id: 'q-l3-frag-1',
      nodeId: 'osi-l3-fragmentation',
      questionText: 'O que acontece quando um pacote IPv4 de 1500 bytes com a flag DF (Don\'t Fragment) ativada atinge um roteador cujo próximo enlace possui MTU de 1400 bytes?',
      options: [
        'O pacote é descartado e o roteador envia um ICMP Destination Unreachable - Fragmentation Needed à origem',
        'O roteador ignora a flag DF e fragmenta o pacote mesmo assim',
        'O roteador compacta o cabeçalho IP para caber no MTU de 1400 bytes',
        'O pacote é retido até que a largura de banda permita o envio integral',
      ],
      correctOptionIndex: 0,
      anchorConcept: 'MTU, Flag Don\'t Fragment e ICMP Type 3 Code 4',
      difficulty: 3,
    },
  ],
  'osi-l3-icmp': [
    {
      id: 'q-l3-icmp-1',
      nodeId: 'osi-l3-icmp',
      questionText: 'Como o utilitário Traceroute descobre a sequência de saltos de roteadores intermediários até um servidor remoto?',
      options: [
        'Enviando pacotes IP com valores sequenciais de TTL (iniciando em 1, depois 2, 3...) para forçar descartes ICMP Time Exceeded em cada salto',
        'Consultando a tabela de roteamento pública global via porta UDP 53',
        'Invocando mensagens ARP remotas com gravação de rota no cabeçalho IP',
        'Enviando requisições ICMP Echo Request especiais com carimbo de rota ativo em L2',
      ],
      correctOptionIndex: 0,
      anchorConcept: 'Operação prática do Traceroute com TTL e ICMP',
      difficulty: 3,
    },
  ],
  'osi-l3-static-dynamic-routing': [
    {
      id: 'q-l3-dyn-1',
      nodeId: 'osi-l3-static-dynamic-routing',
      questionText: 'Qual é a principal vantagem operacional de um protocolo de roteamento dinâmico como OSPF sobre rotas estáticas em uma malha corporativa?',
      options: [
        'Recalcular rotas e convergir automaticamente a topologia diante de quedas de enlaces sem intervenção humana manual',
        'Eliminar a necessidade de endereçamento IP e máscaras nas interfaces',
        'Evitar que o campo TTL seja decrementado durante a comutação rápida',
        'Garantir entrega confiável com retransmissão de pacotes descartados',
      ],
      correctOptionIndex: 0,
      anchorConcept: 'Convergência autônoma de protocolos dinâmicos de roteamento',
      difficulty: 4,
    },
  ],
};
