# Músicos por nome e consulta administrativa de sessões

## Escopo

- No painel do anfitrião: **Menu da sessão → Músicos → Músico** abre um seletor PrimeNG com busca por nome. Somente músicos com e-mail confirmado e status APPROVED são oferecidos. Quem já está vinculado sai das opções e permanece na lista de vinculados.
- O anfitrião não acessa a gestão de cadastros. O diretório fornece apenas identificador opaco e nome. Listagem, liberação e revogação da sessão não devolvem e-mail, credenciais, motivo de aprovação ou outros dados administrativos.
- A seleção usa o identificador da conta, não o texto do nome. Vínculo e revogação continuam exclusivos do anfitrião proprietário da sessão aberta.
- A aprovação é conferida novamente ao vincular, sob bloqueio da conta. Um cadastro suspenso entre a abertura do seletor e a confirmação será recusado. Um vínculo já existente continua visível como indisponível e pode ser revogado.
- A V13 atribui UUIDs estáveis às contas existentes. Não altera senhas nem remove vínculos, sessões ou histórico. Músicos antigos sem nome são identificados como “Músico” seguido de um código curto; novos cadastros já exigem nome.
- O admin tem uma segunda área: **Sessões abertas**, com busca por sessão ou anfitrião. A lista não inclui rascunhos nem sessões encerradas.
- O detalhe administrativo mostra anfitrião, músicos vinculados, convocação atual, fila sugerida com nomes e músicas e pessoas aguardando retorno. Convocação e sugestões permanecem separadas. A tela não possui comandos para chamar, pular, concluir ou encerrar sessões de outro anfitrião.
- Enquanto o detalhe estiver aberto e a página estiver visível, os dados são consultados a cada quatro segundos. O menu permite atualizar manualmente. Se a sessão encerrar, a fila anterior é ocultada e aparece um aviso; atualizar a lista remove a sessão encerrada.

## APIs e arquitetura

- `GET /api/sessions/{session}/musicians/available`: diretório de músicos elegíveis, condicionado à propriedade da sessão aberta.
- `GET /api/sessions/{session}/musicians`: vinculados com `{id,name,enabled}`.
- `POST /api/sessions/{session}/musicians`: `{operationId,musicianId}`.
- `POST /api/sessions/{session}/musicians/revoke`: `{musicianId}`.
- `GET /api/admin/sessions` e `GET /api/admin/sessions/{session}`: somente ADMIN ativo. Não há operações de mutação nesse conjunto de endpoints.

O novo módulo `administration` agrega projeções e APIs públicas dos módulos existentes. O snapshot do detalhe usa o bloqueio da sessão, mantendo consistentes a convocação e a fila. Não altera a ordenação e não cria solicitações nem convocações. A autenticação continua conferindo as permissões atuais da conta.

O formato das chamadas de vínculo mudou: publicar backend e frontend deste incremento em conjunto para evitar que um frontend antigo ainda envie e-mail. Os links de participantes e seus cadastros não mudam.

## Roteiro de teste

1. Reiniciar o backend pela IDE para aplicar a V13. Usar o frontend atualizado.
2. Criar/aprovar um músico com nome. Outro cadastro ainda pendente deve ficar fora do seletor.
3. Como anfitrião, abrir o seletor, buscar pelo nome e liberar acesso. Conferir nome na lista, sem e-mail.
4. Simular nova tentativa após falha: o mesmo identificador de operação não pode duplicar o vínculo. Revogar e conferir que a pessoa volta às opções, se continuar aprovada.
5. Suspender um músico no admin enquanto o seletor está aberto: a tentativa de vínculo deve falhar. Conferir que o músico suspenso não consegue consultar a sessão e que o anfitrião pode revogar o vínculo existente.
6. Entrar como admin, abrir **Sessões abertas** e localizar uma sessão de outro anfitrião.
7. Conferir anfitrião, músicos, convocação e fila. Operar a fila pelo anfitrião e verificar a atualização no admin.
8. Encerrar a sessão pelo anfitrião. O detalhe deve ocultar a fila e avisar sobre o encerramento; atualizar a lista deve remover a sessão.
9. Confirmar que um anfitrião comum e um músico não conseguem consultar as APIs administrativas, e que o admin não consegue operar a fila de outro anfitrião por essas telas.

## Verificações

`./mvnw -B verify` em backend valida a V13, privacidade do diretório, elegibilidade e permissões em PostgreSQL temporário. O responsável executa pelo terminal da IDE. Os testes de navegador usam API simulada em celular e desktop, incluindo seleção por nome, repetição segura do vínculo, revogação, consulta da fila e encerramento remoto.
