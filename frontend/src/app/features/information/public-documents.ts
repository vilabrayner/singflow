export interface PublicDocument {
  title: string;
  introduction: string;
  sections: { title: string; paragraphs?: string[]; items?: string[] }[];
}
export const privacyEmail = 'contato@flowave.tec.br';
export const publicDocumentLinks = [
  { path: '/politica-privacidade', label: 'Política de Privacidade', key: 'privacy' },
  { path: '/politica-seguranca', label: 'Política de Segurança', key: 'security' },
  { path: '/lgpd', label: 'LGPD e seus direitos', key: 'rights' },
  { path: '/excluir-dados-pessoais', label: 'Excluir dados pessoais', key: 'deletion' },
  { path: '/termos-de-uso', label: 'Termos de Uso', key: 'terms' },
  { path: '/callback', label: 'Conexão com o WhatsApp', key: 'callback' },
];
export const publicDocuments: Record<string, PublicDocument> = {
  privacy: {
    title: 'Política de Privacidade',
    introduction:
      'Esta política explica o uso de dados pessoais na plataforma SingFlow, utilizada para organizar sessões de karaokê, pedidos musicais e apresentações. O canal de contato sobre privacidade é contato@flowave.tec.br.',
    sections: [
      {
        title: 'Quais dados são utilizados',
        items: [
          'Participação na sessão: nome informado, mesa opcional, ordem de chegada, pedidos de músicas, alterações de tom, convocações e histórico das apresentações.',
          'Conta opcional: nome, e-mail, senha protegida por hash e informações de confirmação e situação da conta.',
          'Avisos opcionais: número confirmado de WhatsApp, preferências e registros de autorização; no navegador, endereço e chaves da assinatura de Web Push.',
          'Dados técnicos e de segurança necessários à autenticação, controle de acesso, prevenção de abuso e registro das operações.',
        ],
      },
      {
        title: 'Finalidades e escolhas',
        paragraphs: [
          'Os dados necessários à participação e à conta são usados para executar o serviço solicitado, organizar a fila e permitir a retomada do acesso. Informações de segurança são usadas para proteger as contas e a operação do sistema.',
          'O cadastro do participante é opcional: é possível participar pelo QR Code sem criar conta. WhatsApp e Web Push dependem de autorização e ativação voluntárias. Os avisos são destinados à convocação no karaokê; o aplicativo não usa essa autorização para campanhas de marketing.',
        ],
      },
      {
        title: 'Quem pode ver e receber dados',
        paragraphs: [
          'O anfitrião e os músicos autorizados consultam as informações necessárias à sessão. Administradores gerenciam os cadastros e a operação. Quando houver um painel público de TV habilitado, o nome informado e os dados da apresentação poderão aparecer no local; números de telefone, e-mails e credenciais não devem ser exibidos nesse painel.',
          'Provedores de hospedagem e e-mail apoiam a operação. Se o canal for ativado, a Meta/WhatsApp recebe o número de destino e os dados necessários à entrega; o serviço de push do navegador recebe a assinatura e a mensagem protegida pelo protocolo Web Push. Esses provedores podem tratar dados fora do Brasil, conforme a infraestrutura utilizada.',
          'Consultas musicais enviam termos como título e artista aos serviços integrados de catálogo, cifra, streaming ou letras. Abrir links externos também está sujeito às políticas dos respectivos serviços. Não comercializamos os dados pessoais dos participantes.',
        ],
      },
      {
        title: 'Conservação, cookies e segurança',
        paragraphs: [
          'Cookies de sessão e de participação mantêm o acesso e permitem retomar a participação no aparelho. O navegador pode guardar a identificação da última sessão. São recursos funcionais; encerrar uma sessão de karaokê não exclui automaticamente a conta ou o histórico.',
          'Os dados são conservados enquanto necessários às finalidades informadas e às obrigações aplicáveis. Solicitações de exclusão são analisadas para eliminar ou anonimizar os dados pertinentes, ressalvadas as hipóteses de conservação previstas em lei. Registros de segurança e informações necessárias ao exercício de direitos podem exigir conservação específica.',
          'Aplicamos controles de autenticação, permissões e proteção de credenciais. Consulte também a Política de Segurança.',
        ],
      },
      {
        title: 'Seus direitos e contato',
        paragraphs: [
          'Você pode solicitar confirmação do tratamento, acesso, correção, informações sobre compartilhamento e, quando aplicável, portabilidade, oposição, anonimização, bloqueio ou eliminação. Pode também revogar a autorização dos avisos e pedir informações sobre essa escolha.',
          'Use contato@flowave.tec.br para exercer direitos ou tirar dúvidas. As instruções de exclusão e a página LGPD explicam como identificar sua participação sem enviar senhas. Esta política será atualizada quando houver mudanças relevantes no tratamento.',
        ],
      },
    ],
  },
  security: {
    title: 'Política de Segurança',
    introduction:
      'O SingFlow utiliza controles de acesso para proteger contas, participações e integrações. Dúvidas e relatos de segurança podem ser enviados a contato@flowave.tec.br.',
    sections: [
      {
        title: 'Proteção de contas e sessões',
        items: [
          'As senhas são armazenadas por hash, sem disponibilização da senha original aos operadores.',
          'Permissões são verificadas de acordo com a conta e a sessão. Participantes não recebem acesso administrativo por criar uma conta.',
          'Credenciais de participação são mantidas em cookies protegidos contra leitura por scripts. Operações sensíveis têm validações de autorização e de proteção contra requisições indevidas.',
          'Links de confirmação e vínculo têm validade e uso controlados. O resgate do acesso pode encerrar o vínculo anterior do aparelho.',
        ],
      },
      {
        title: 'Integrações e avisos',
        paragraphs: [
          'As credenciais privadas dos provedores ficam no backend. A confirmação do número do WhatsApp depende de mensagem recebida pela integração autenticada. A ativação de Web Push exige ação do usuário e permissão do navegador.',
          'A retirada da autorização impede novas entregas pendentes que ainda possam ser canceladas. Um aviso já entregue pelo provedor pode continuar visível no aparelho; consulte o painel para verificar o estado atual da convocação.',
        ],
      },
      {
        title: 'Cuidados ao utilizar o aplicativo',
        items: [
          'Use o endereço oficial do SingFlow com HTTPS e mantenha o navegador atualizado.',
          'Não compartilhe senha nem QR Code individual de recuperação com terceiros.',
          'Em aparelhos compartilhados, saia da conta e use a opção de esquecer o acesso à participação quando necessário.',
        ],
      },
      {
        title: 'Relatar um problema',
        paragraphs: [
          'Envie uma descrição do comportamento, data aproximada e forma de reproduzi-lo. Não envie senhas, chaves de API, cookies, códigos de acesso ou dados pessoais de outras pessoas. A equipe avaliará o relato pelo canal de contato.',
        ],
      },
    ],
  },
  rights: {
    title: 'LGPD e seus direitos',
    introduction:
      'A Lei Geral de Proteção de Dados Pessoais orienta o tratamento de dados no Brasil. Esta página facilita o exercício de direitos relacionados ao uso do SingFlow.',
    sections: [
      {
        title: 'O que você pode solicitar',
        items: [
          'Confirmação e acesso aos seus dados; correção de informações incompletas, inexatas ou desatualizadas.',
          'Informações sobre uso, finalidade, conservação e compartilhamento.',
          'Anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade, quando aplicável.',
          'Portabilidade, oposição e revisão de decisões automatizadas, nas condições aplicáveis.',
          'Revogação do consentimento e informações sobre a opção de não autorizar tratamentos facultativos.',
        ],
      },
      {
        title: 'Como exercer seus direitos',
        paragraphs: [
          'Escreva para contato@flowave.tec.br informando qual direito deseja exercer e os dados mínimos para localizar seu cadastro ou participação. Se não criou conta, informe o nome usado e a sessão ou data do evento.',
          'Podemos solicitar uma confirmação proporcional de identidade para proteger seus dados contra pedidos de terceiros. Não envie senhas ou documentos pessoais sem uma solicitação específica e justificada. O atendimento observará os prazos e condições legais aplicáveis.',
        ],
      },
      {
        title: 'Avisos e exclusão',
        paragraphs: [
          'As preferências de WhatsApp e Web Push podem ser alteradas na sua conta. Desativar os avisos não exclui a conta nem o histórico. Para isso, siga as instruções em Excluir dados pessoais.',
          'Se houver alguma informação que precise ser conservada por obrigação legal ou outra hipótese aplicável, explicaremos o motivo. Você também pode consultar a ANPD sobre os direitos dos titulares.',
        ],
      },
    ],
  },
  deletion: {
    title: 'Excluir dados pessoais',
    introduction:
      'Você pode solicitar a exclusão dos seus dados do SingFlow pelo canal contato@flowave.tec.br, mesmo que não tenha criado uma conta.',
    sections: [
      {
        title: 'Como solicitar',
        items: [
          'Envie um e-mail com o assunto “Exclusão de dados pessoais — SingFlow”.',
          'Informe o e-mail da conta. Se participou sem cadastro, informe o nome usado e o evento ou a data da sessão.',
          'Descreva se deseja excluir a conta e seus vínculos ou apenas um dado específico. Para remover uma vinculação de WhatsApp, informe isso no pedido.',
          'Não envie sua senha, códigos de confirmação ou documentos de identidade no pedido inicial.',
        ],
      },
      {
        title: 'O que acontece depois',
        paragraphs: [
          'A equipe confirmará o recebimento pelo atendimento e poderá pedir uma verificação proporcional para evitar a exclusão solicitada por terceiros. Em seguida, analisará a eliminação ou anonimização dos dados localizados e informará o resultado.',
          'Caso alguma informação precise ser conservada por uma hipótese legal aplicável, o motivo será informado. O processamento de um pedido não depende de você continuar participando das sessões.',
        ],
      },
      {
        title: 'Desativar avisos ou sair da fila',
        paragraphs: [
          'Para parar apenas os avisos, altere as preferências na sua conta. No WhatsApp conectado, também é possível enviar “SAIR” ou “PARAR” para revogar os avisos desse canal.',
          'Sair da fila ou esquecer o acesso no aparelho não equivale à exclusão da conta e do histórico. Abrir esta página também não apaga dados automaticamente: o pedido é feito pelo canal de atendimento.',
        ],
      },
    ],
  },
  terms: {
    title: 'Termos de Uso',
    introduction:
      'O SingFlow organiza a participação em sessões de karaokê. Estes termos descrevem o uso da plataforma por participantes, anfitriões, músicos e administradores.',
    sections: [
      {
        title: 'Participação e cadastro',
        paragraphs: [
          'O participante pode entrar pelo link ou QR Code da sessão sem criar conta. A conta pessoal é opcional e permite vincular participações e escolher avisos. O cadastro de anfitriões e músicos está sujeito à confirmação de e-mail e à liberação administrativa.',
          'Use informações que permitam sua identificação no evento e proteja suas credenciais. Não utilize contas ou números de terceiros sem autorização.',
        ],
      },
      {
        title: 'Fila e condução do evento',
        paragraphs: [
          'A fila apresenta oportunidades conforme as regras da sessão, considerando chegada e apresentações. A posição sugerida pode mudar, e o anfitrião pode realizar intervenções operacionais, como convocar, pausar ou reorganizar participantes.',
          'Pedir uma música ou receber um aviso não garante horário fixo de apresentação. O encerramento do evento e as condições de participação são conduzidos pelos responsáveis pela sessão.',
        ],
      },
      {
        title: 'Avisos e conteúdos externos',
        paragraphs: [
          'WhatsApp e Web Push são ferramentas opcionais de apoio. A entrega depende da autorização, da configuração do aparelho, da conexão e dos provedores. O painel da sessão é a referência para o estado atual da participação.',
          'Catálogos, cifras, letras, vídeos e serviços de streaming estão sujeitos aos direitos e às condições dos respectivos titulares e provedores. O SingFlow não concede licenças sobre esses conteúdos nem substitui as autorizações necessárias à realização do evento.',
        ],
      },
      {
        title: 'Uso adequado e contato',
        paragraphs: [
          'Não use o aplicativo para fraudar a fila, acessar dados sem autorização, enviar conteúdo abusivo ou interferir no serviço. A administração pode restringir acessos indevidos, observados os direitos aplicáveis.',
          'Questões sobre o serviço podem ser enviadas a contato@flowave.tec.br. O tratamento de dados está descrito na Política de Privacidade. Atualizações relevantes destes termos serão identificadas nesta página.',
        ],
      },
    ],
  },
  callback: {
    title: 'Conexão com o WhatsApp',
    introduction:
      'O WhatsApp é um canal opcional para avisar quando você for chamado no karaokê. A configuração do número e dos avisos fica na sua conta.',
    sections: [
      {
        title: 'Conectar seu número',
        paragraphs: [
          'Na sua conta, autorize os avisos pelo WhatsApp e escolha conectar seu número. Abra o link apresentado e envie a mensagem pronta para confirmar a vinculação. Depois, volte à sua conta e atualize a situação.',
          'A confirmação depende do recebimento da mensagem pela integração. Apenas abrir esta página não confirma a conexão e não envia mensagens em seu nome.',
        ],
      },
      {
        title: 'Controle dos avisos',
        paragraphs: [
          'Você pode desativar o canal nas preferências ou enviar “SAIR” ou “PARAR” no WhatsApp conectado. Para dúvidas sobre vinculação ou privacidade, use contato@flowave.tec.br.',
        ],
      },
    ],
  },
};
