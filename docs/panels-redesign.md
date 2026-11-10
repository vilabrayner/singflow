# Redesenho dos painéis — acessibilidade e usabilidade

Estado: desenho do anfitrião aprovado em 10/11/2026, com 17 telas (00–16). Referências e limites em [Desenho aprovado do anfitrião](host-redesign-approved.md). Desenhos de participante e músico também aprovados na conversa. O [incremento 01 do anfitrião](host-redesign-increment-01.md) entrega base visual, login e sessões; demais incrementos dependem de autorização específica.

## Objetivo

Facilitar a condução de um karaokê ao vivo e a participação por pessoas com pouca familiaridade digital. Redesenhar a organização e a interação das telas, com acessibilidade desde o início. Preservar a identidade SingFlow: azul-marinho #0B1E3F, roxo #7C3AED, amarelo #FBBF24 e Manrope; validar as combinações de contraste.

Manter Angular, PrimeNG e PrimeIcons, a organização por funcionalidades e os elementos reutilizáveis em shared quando houver uso comum real. As regras de fila, contagens, faltas, permissões, saída e retorno não mudam por decisão visual.

## Painel do anfitrião

- Destacar sessão selecionada e seu estado para evitar operar no evento errado.
- Dar prioridade visual à convocação em andamento e às ações de palco; manter sugestão e convocação confirmada claramente distintas.
- Tornar inscrição assistida, busca e nova música fáceis de localizar, preservando a prevenção de cadastros duplicados.
- Separar ações frequentes das ações de maior consequência, como registrar falta, retirar participante ou encerrar sessão. Explicar efeitos e confirmar quando necessário.
- Reduzir a necessidade de percorrer uma página longa para alternar entre palco, pessoas e administração. Revisar a navegação em desktop, tablet e celular antes de escolher a composição final.
- Mostrar estado de atualização/conexão sem interromper o trabalho; preservar o preenchimento dos formulários e a posição de foco.

## Painel do participante

- Priorizar celular e linguagem simples: entrada, pedido, espera, chamada, saída e retorno.
- Mostrar com clareza a situação atual e a próxima ação disponível, com dados próprios e histórico em posição secundária.
- Diferenciar sugestão de chamada confirmada, sem prometer posição ou horário fixos.
- Explicar pausa, ausência, saída da fila, retorno e esquecimento do acesso com linguagem de uso, mantendo o controle do anfitrião nos casos previstos.
- Diminuir esforço de preenchimento, mostrar campos opcionais e permitir corrigir erros sem perder dados.
- Manter alternativa ao QR Code e orientação para inscrição assistida.

## Acessibilidade e critérios de verificação

Usar [WCAG 2.2 nível AA](https://www.w3.org/WAI/WCAG22/quickref/) como referência para os fluxos em escopo. Isso é uma meta de projeto e verificação, não uma declaração antecipada de conformidade.

- Realizar os fluxos principais somente com teclado, com sequência lógica, foco visível e sem foco escondido por cabeçalhos ou barras fixas.
- Em diálogos, posicionar e conter o foco adequadamente e devolvê-lo ao controle de origem ao fechar; oferecer uma forma de cancelar.
- Conferir nomes acessíveis de botões, inclusive ícones, associação dos rótulos aos campos, hierarquia de títulos e identificação da navegação.
- Garantir contraste mínimo de 4,5:1 para texto comum; verificar exceções aplicáveis a texto grande e contraste de controles conforme a referência. Nunca comunicar estado somente por cor.
- Projetar controles de toque confortáveis, com meta de 44 × 44 CSS px para ações principais, e conferir o critério AA de tamanho/espaçamento dos demais controles. A meta de 44 px é uma escolha do projeto.
- Testar zoom de texto a 200% e reorganização em largura de 320 CSS px, sem perda de informações ou ações essenciais e sem rolagem horizontal da página.
- Anunciar erros, confirmações e mudanças relevantes para leitor de tela, sem repetir anúncios a cada consulta automática. A atualização não deve roubar foco nem apagar texto em edição.
- Usar mensagens de erro junto aos campos e instruções para corrigi-los; manter valores válidos após falha e evitar confirmações falsas em operações sem resposta.
- Preservar colagem, gerenciadores de senha e preenchimento automático apropriado no login. Respeitar preferência por movimento reduzido quando houver animação.

## Entregas e sequência

1. Revisar os dois painéis existentes: registrar problemas por fluxo e priorizar o que prejudica a operação do evento ou impede acesso.
2. Desenhar wireframes para anfitrião em desktop/tablet e participante em celular, incluindo estados vazio, carregando, desconectado, erro e sessão encerrada.
3. Apresentar protótipo navegável ou telas demonstrativas para revisão do responsável; aprovar organização, textos e ações antes de implementar o redesenho.
4. Após autorização, implementar primeiro o painel do anfitrião e depois o participante, em incrementos revisáveis. Criar elementos shared apenas quando houver reutilização concreta.
5. Executar regressão dos fluxos de negócio e verificação de acessibilidade automática, por teclado e com leitor de tela disponível. Registrar ferramenta, navegador e limitações; testes automáticos isolados não encerram a avaliação.
6. Validar tarefas com o responsável e, quando possível, com alguém pouco familiarizado com o aplicativo. Testes com usuários externos dependem da organização pelo responsável.

## Aceite

- Responsável aprova o desenho e consegue conduzir inscrição, convocação e conclusão com clareza sobre a sessão e a pessoa selecionadas.
- Participante consegue entrar, pedir música, reconhecer chamada, sair e retornar sem confundir saída da fila com esquecimento do acesso.
- Regras, permissões, auditoria e idempotência existentes continuam válidas.
- Estados de erro e desconexão são compreensíveis e não perdem dados de formulário indevidamente.
- Evidências de teclado, responsividade, contraste e leitor de tela registradas; impedimentos conhecidos identificados e tratados antes do aceite dos fluxos afetados.
- Roteiros existentes atualizados apenas onde a interface mudou; ensaio local pelo responsável. Hospedagem não é pré-requisito para revisar ou implementar o desenho.

## Fora desta etapa

Provisão AWS, mudança de banco, publicação, migração da stack, catálogo, autenticação nova e implementação do painel do músico. Essas funcionalidades têm revisão própria no roadmap. Não iniciar serviços, contatar usuários ou publicar protótipos automaticamente.
