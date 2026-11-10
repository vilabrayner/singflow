# Revisão — participante pelo celular, pedidos e QR Code

Estado: proposta para revisão. Não implementado e não autorizado por este documento.

Base: [fluxo assistido aceito](acceptance/001-assisted-flow.md), [fila e palco aceitos](acceptance/002-stage-flow.md) e [regras de participação](decisions/004-participation-and-repeat-suggestions.md).

## Objetivo e recorte proposto

Permitir que quem consegue usar o celular faça check-in e envie músicas, mantendo a inscrição assistida como alternativa completa. Os dois caminhos usam a mesma fila, as mesmas contagens e os mesmos critérios de prioridade.

O anfitrião mostra o QR Code ou compartilha o link da sessão. O participante abre o endereço, preenche nome, primeira música, artista opcional e mesa opcional. O servidor registra entrada e pedido atomicamente e devolve acesso limitado à própria participação. Não exigir conta, e-mail ou telefone no piloto.

O participante acompanha seus pedidos, seu estado de participação e sua convocação confirmada. Exibe-se a indicação de sugestão quando pertinente, com aviso de que ela pode mudar e não confirma chamada. Não prometer horário exato ou posição fixa de apresentação.

## Decisões propostas

| Tema | Proposta |
| --- | --- |
| Entrada | Nome e primeira música obrigatórios; mesa e artista opcionais, com os mesmos limites do cadastro assistido |
| Identidade | Credencial própria de participante em cookie HttpOnly, separada da autenticação do anfitrião; Secure em HTTPS e proteção CSRF nas alterações |
| Check-in repetido | No mesmo navegador e sessão, recuperar cadastro existente sem mudar chegada ou contagens |
| Outros dispositivos | Não reconhecer a pessoa automaticamente; orientar procurar o anfitrião para evitar novo cadastro |
| Identidade por nome | Nomes/mesas iguais não unem participações nem permitem recuperar credenciais |
| Pedidos | Adicionar e consultar os próprios pedidos; cancelar apenas pedidos ainda pendentes |
| Pedido convocado | Não pode ser cancelado pelo participante; orientar falar com o anfitrião para resolver a convocação |
| Pausa, faltas e retorno | Continuam sob controle manual do anfitrião conforme as regras já aceitas; participante vê a situação e pede atendimento ao anfitrião |
| Saída | Confirmação antes de sair; encerra a própria participação, cancela pedidos não atendidos e resolve convocação como desistência; revoga credencial e limpa vínculo local |
| Nova entrada após saída | Não prometer reconhecimento automático após revogar a credencial; retorno do cadastro conhecido é feito pelo anfitrião para preservar contagens e evitar duplicidade |
| Participação assistida existente | Não vincular ao celular pelo nome; transferência segura fica fora deste recorte e exige revisão própria |
| Sessão fechada/encerrada | Impedir novas entradas e pedidos; não apagar histórico, e permitir leitura própria enquanto a credencial for válida |
| Atualização | Consultas periódicas a cada 10 segundos quando a página estiver visível, mais botão Atualizar; informar desconexão e última atualização, sem confirmar operações offline |
| Privacidade | Mostrar ao participante apenas os próprios pedidos e dados; não publicar lista nominal completa nem dados dos demais |

Cada item é proposta nova a aprovar. O comportamento de saída deve reutilizar as regras aceitas, sem permitir que um participante modifique outro ou afete o login do anfitrião.

## Link e QR Code

Proposta: link público exclusivo por sessão, gerado com identificador aleatório e sem credenciais de anfitrião ou participante. QR Code contém o mesmo link. Conhecer esse endereço permite solicitar entrada em sessão aberta, mas não concede administração nem acesso aos dados de terceiros.

Gerar a imagem do QR Code localmente na aplicação, sem enviar o link a serviço externo. Disponibilizar também link copiável e texto de orientação para quem não consegue escanear. A inscrição pelo anfitrião permanece acessível.

O endereço público deve ser configurado explicitamente, sem montar links a partir de um Host HTTP não validado. No piloto, definir se basta compartilhar a tela ou se o QR precisa de arquivo para imprimir. Revogação/rotação do link e proteção contra divulgação indevida merecem decisão antes da publicação.

## Identidade, autorização e concorrência

A credencial do participante não fica na URL ou no QR, não usa nome/mesa como senha e não é compartilhada com o host. No servidor, armazenar somente uma representação protegida do token e vincular permissões à sessão e à participação correspondente. Não registrar tokens em logs.

Proteger cadastro e envio contra retentativas duplicadas e contra duas abas concorrentes. Usar os mesmos bloqueios de sessão, restrições e auditoria do fluxo assistido. Sair deve revogar acesso a alterações, inclusive em outras abas com credencial antiga. Ler a situação encerrada após saída não deve depender de manter uma credencial revogada.

Fazer check-in pelo navegador do anfitrião não pode trocar seu papel ou desconectá-lo. As rotas públicas não podem abrir a API administrativa. A política de limitação de requisições e de expiração da credencial precisa ser fechada antes de disponibilizar acesso pela internet.

## Local, celular e hospedagem

`localhost` e `127.0.0.1` apontam para o próprio aparelho. O celular não alcança a aplicação do computador usando o QR com esses endereços. Hoje os serviços de desenvolvimento e Docker foram configurados para loopback.

Primeiro validar o fluxo no navegador do computador, sem alterar exposição de rede. Para teste real em celular, o responsável deverá escolher entre acesso pela mesma rede local (configuração explícita de bind/proxy/firewall) ou ambiente HTTPS publicado. Essa mudança exige revisão e autorização; não abrir portas ou publicar automaticamente. Hospedagem continua adiada conforme preferência do responsável.

## Critérios de aceite propostos

- Link abre a sessão correta e QR não contém credenciais.
- Check-in cria uma participação e um primeiro pedido, com ator/origem na auditoria.
- Atualizar a página, reenviar ou usar duas abas não duplica a participação no mesmo navegador.
- Duas pessoas com o mesmo nome não recebem acesso uma à outra.
- Pedido novo reutiliza a participação e não muda chegada ou apresentações.
- Pedido pendente pode ser cancelado; pedido reservado não pode ser alterado silenciosamente.
- Participante assistido e autônomo seguem a mesma fila, faltas e justiça.
- Participante vê sua convocação após atualização, inclusive sem pedido original.
- Saída durante convocação resolve a desistência, preserva histórico e bloqueia novas mutações pela credencial antiga.
- Suspensão, pausa, inativação e sessão encerrada exibem orientação coerente com as ações permitidas.
- Perda de conexão e retentativa não geram confirmação falsa ou duplicação.
- Login do anfitrião continua funcionando no mesmo navegador.
- Validar com serviços independentes e Docker; testar aparelho real apenas no ambiente de rede explicitamente aprovado.

## Fora do recorte

Catálogo híbrido com aprovação, conta permanente, recuperação entre dispositivos, transferência de cadastro assistido, painel do músico, notificações push, WebSocket, PWA e publicação automática.

## Antes da implementação

Aprovar o recorte e as decisões da tabela; definir expiração de credencial, proteção de requisições públicas e apresentação/rotação do link para o piloto. Depois autorizar explicitamente a implementação. O registro do aceite anterior não substitui essas decisões.
