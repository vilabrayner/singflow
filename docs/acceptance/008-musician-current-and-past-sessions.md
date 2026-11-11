# Sessão atual e sessões anteriores do músico

## Comportamento

- A tela principal usa somente uma sessão OPEN da lista autorizada. Mantém a sessão aberta que o músico já escolheu ou seleciona a primeira aberta disponível. Não usa uma sessão CLOSED como substituta.
- Sem sessão aberta, o painel mostra o aviso de espera. Se houver sessões anteriores autorizadas, oferece **Ver sessões anteriores**.
- Em **Opções do músico → Trocar sessão**, a modal agrupa sessões abertas e anteriores. Sem nenhuma aberta, o seletor mostra somente as anteriores disponíveis para a conta.
- Escolher sessão aberta troca a sessão atual e fecha o seletor. Escolher uma encerrada mantém a consulta dentro da mesma modal, com histórico do palco e fila restante ao encerrar. A seta do cabeçalho volta à lista; Fechar encerra a consulta.
- Consultar uma sessão anterior não muda a sessão aberta na tela principal e não interrompe sua atualização automática.
- Se a sessão atual encerrar, o painel limpa os dados ativos e volta à espera, mesmo se o fechamento ocorrer entre a leitura da lista e a leitura dos detalhes. A sessão encerrada passa a estar disponível no seletor, conforme as permissões.
- A lista continua vindo da API autenticada e limitada aos acessos da conta. Não é um registro novo de presença: o acesso às sessões anteriores depende de o vínculo continuar autorizado. Revogar o vínculo remove a sessão do seletor e limpa seus dados da modal na próxima consulta da lista.
- Respostas atrasadas não devem repopular uma modal que já foi fechada ou passou a consultar outra sessão. A navegação entre lista e detalhes ajusta o foco para o título da modal.

Este incremento altera apenas o frontend e o roteiro de aceite; usa as APIs existentes, sem nova migration.

## Roteiro

1. Com uma conta de músico vinculada somente a sessões encerradas, abrir `/musico`: deve aparecer **Aguardando novas sessões**, sem nome, palco ou músicas da última sessão na tela principal.
2. Abrir **Ver sessões anteriores**, escolher uma sessão e conferir os dados na modal. Usar a seta para voltar à lista e Fechar para retornar ao painel de espera.
3. Com uma sessão aberta e outra encerrada, conferir que a aberta aparece na tela principal mesmo se uma encerrada vier primeiro na resposta da API.
4. Consultar uma sessão anterior e conferir que a sessão aberta permanece na tela principal. Fechar a modal não deve trocar a sessão atual.
5. Encerrar a sessão atual pelo anfitrião: o músico deve voltar ao estado de espera na próxima atualização. Os dados antigos não devem permanecer como sessão atual.
6. Revogar o acesso a uma sessão anterior enquanto o músico a consulta: seus dados devem desaparecer da modal quando a lista for atualizada.

## Verificação

Build de produção e testes de navegador com API simulada em celular e desktop cobrem os quatro cenários novos: somente sessões encerradas, consulta histórica durante uma sessão aberta, revogação do histórico e fechamento entre lista e detalhe. Os testes existentes do painel do músico e de preservação da rolagem também foram executados.
