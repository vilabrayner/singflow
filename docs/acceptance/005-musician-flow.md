# Painel do músico — primeiro incremento

## Fluxo aprovado

O músico faz o próprio cadastro e login em `/musico`. O anfitrião libera cada sessão pelo e-mail da conta. O painel apresenta a convocação atual e a fila sugerida completa com nome, música e artista, busca e histórico do palco.

As consultas são atualizadas a cada quatro segundos enquanto a página está visível. O músico acompanha a confirmação de ida e a conclusão registrada pelo anfitrião, incluindo apresentações concluídas sem confirmação pelo participante. O estado da convocação permanece separado da fila sugerida.

A migration V11 acrescenta o papel MUSICIAN à tabela existente de credenciais e registra liberações de sessão com histórico de operações. Contas existentes mantêm o papel HOST. O cadastro público cria contas MUSICIAN. As permissões administrativas continuam associadas ao papel HOST.

## Execução e ensaio

1. Atualizar o backend pela IDE para aplicar a V11 e manter o frontend em execução.
2. No celular do músico, abrir `/musico`, escolher **Criar conta de músico** e cadastrar e-mail e senha com pelo menos 12 caracteres.
3. Conferir o estado **Aguardando uma sessão** após o login.
4. No anfitrião, abrir uma sessão e acessar **Menu da sessão → Músicos**.
5. Informar o e-mail cadastrado e escolher **Liberar acesso**.
6. Conferir a sessão no painel do músico. Usar a busca e verificar toda a lista de próximas músicas.
7. Fazer uma convocação pelo anfitrião. Conferir nome, música, artista e confirmação de ida no painel do músico.
8. Concluir a apresentação pelo anfitrião. Conferir atualização do palco, fila e histórico.
9. Em **Menu da sessão → Músicos**, abrir o menu do e-mail e revogar o acesso. Conferir que a sessão deixa de aparecer no painel do músico.
10. Confirmar que o músico consegue sair da conta e entrar novamente.

Sessões compartilhadas encerradas permanecem disponíveis para consultar o histórico enquanto a liberação estiver ativa. O anfitrião pode consultar suas próprias sessões pelo painel do músico.

## Verificações

O backend foi validado pelo responsável com `./mvnw -B verify`, incluindo cadastro/login, isolamento por sessão, bloqueio de ações administrativas, repetição concorrente da liberação e revogação resistente a novas tentativas antigas.

Os testes de navegador usam API simulada e abrangem cadastro/login, fila completa, busca, atualizações do palco, histórico, liberação/revogação e fluxo do anfitrião. O ensaio integrado nos aparelhos do evento fica disponível ao responsável após a atualização dos serviços pela IDE.
