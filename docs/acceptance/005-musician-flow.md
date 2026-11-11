# Painel do músico — primeiro incremento

## Fluxo aprovado

O músico faz o próprio cadastro e login em `/musico`. Após a confirmação do e-mail e a aprovação administrativa, o anfitrião libera cada sessão escolhendo o músico pelo nome em um seletor com busca. O e-mail não é exibido nem retornado pelas APIs de vínculo do anfitrião. O painel apresenta a convocação atual e a fila sugerida completa com nome, música e artista, busca e histórico do palco.

As consultas são atualizadas a cada quatro segundos enquanto a página está visível. O músico acompanha a confirmação de ida e a conclusão registrada pelo anfitrião, incluindo apresentações concluídas sem confirmação pelo participante. O estado da convocação permanece separado da fila sugerida.

A migration V11 acrescenta o papel MUSICIAN à tabela existente de credenciais e registra liberações de sessão com histórico de operações. Contas existentes mantêm o papel HOST. O cadastro público cria contas MUSICIAN. A V12 passou a exigir confirmação e aprovação dos novos cadastros e acrescentou uma permissão ADMIN independente. A V13 acrescenta identificadores públicos opacos às contas para selecionar e revogar músicos sem expor o e-mail. Os vínculos já existentes são preservados.

## Execução e ensaio

1. Atualizar o backend pela IDE para aplicar as migrations pendentes, incluindo a V13 e manter o frontend em execução.
2. No celular do músico, abrir `/musico`, escolher **Criar conta de músico** e cadastrar nome, e-mail e senha com pelo menos 12 caracteres. Confirmar o e-mail e aprovar o cadastro no admin.
3. Conferir o estado **Aguardando uma sessão** após o login.
4. No anfitrião, abrir uma sessão e acessar **Menu da sessão → Músicos**.
5. Abrir o seletor **Músico**, buscar pelo nome, selecionar a pessoa e escolher **Liberar acesso**. Apenas músicos aprovados e com e-mail confirmado podem ser vinculados.
6. Conferir a sessão no painel do músico. Usar a busca e verificar toda a lista de próximas músicas.
7. Fazer uma convocação pelo anfitrião. Conferir nome, música, artista e confirmação de ida no painel do músico.
8. Concluir a apresentação pelo anfitrião. Conferir atualização do palco, fila e histórico.
9. Em **Menu da sessão → Músicos**, abrir o menu do nome do músico e revogar o acesso. Conferir que a sessão deixa de aparecer no painel do músico.
10. Confirmar que o músico consegue sair da conta e entrar novamente.

Sessões compartilhadas encerradas permanecem disponíveis para consultar o histórico enquanto a liberação estiver ativa. A tela principal exibe exclusivamente uma sessão OPEN liberada; se não houver, mostra o estado de espera. Sessões anteriores são consultadas dentro da modal do seletor, com retorno à lista pela seta do cabeçalho. O encerramento da sessão atual leva automaticamente ao estado de espera. O anfitrião pode consultar suas próprias sessões pelo painel do músico. Detalhes e roteiro em [008-musician-current-and-past-sessions.md](008-musician-current-and-past-sessions.md).

## Verificações

O backend foi validado pelo responsável com `./mvnw -B verify`, incluindo cadastro/login, isolamento por sessão, bloqueio de ações administrativas, repetição concorrente da liberação e revogação resistente a novas tentativas antigas.

Os testes de navegador usam API simulada e abrangem cadastro/login, fila completa, busca, atualizações do palco, histórico, liberação/revogação e fluxo do anfitrião. O ensaio integrado nos aparelhos do evento fica disponível ao responsável após a atualização dos serviços pela IDE.
