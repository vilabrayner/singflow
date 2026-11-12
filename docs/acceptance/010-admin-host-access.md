# Administrador como anfitrião

Correção autorizada em 11/11/2026. Administrador ativo pode consultar e operar qualquer sessão pelo painel do anfitrião. A lista `/api/sessions` inclui todas as sessões para administradores; anfitriões comuns continuam vendo somente as próprias.

No painel admin, abrir uma sessão e usar o menu **Gerenciar como anfitrião**. O link `/anfitriao?sessao=<id>` seleciona exatamente aquela sessão; se não estiver disponível, informa o erro sem abrir outra sessão silenciosamente. Histórico e rascunhos também ficam acessíveis pelo seletor do anfitrião. O perfil principal do admin pode ser HOST ou MUSICIAN.

A validação administrativa consulta a conta atual (aprovada e e-mail confirmado). Remover o papel admin retira o acesso a sessões de outros anfitriões nas próximas requisições. Não há troca de identidade ou transferência de propriedade: a sessão conserva o proprietário e cada operação continua auditada com o administrador como ator.

Bloqueios de concorrência, CSRF, isolamento de participantes/pedidos, impedimento de reabertura e restrições de palco continuam valendo. Não há migration.

Ensaio: admin abre sessão alheia, cadastra participante, chama/conclui apresentação, gerencia músicos e encerra respeitando as regras. Conferir auditoria e proprietário original. Anfitrião comum não deve listar nem operar sessões alheias. Revogar permissão admin deve impedir novo acesso à sessão alheia.

## Verificações

Build frontend aprovado; 23 testes backend sem banco aprovados (incluindo quatro testes de autorização de sessão e verificação Modulith). Doze testes de interface aprovados em desktop/mobile com API simulada, incluindo admin com perfil MUSICIAN, escolha da sessão correta, link sem acesso e regressão do login/encerramento.

Testes com PostgreSQL compilados; execução completa `./mvnw -B verify` solicitada ao responsável. Ensaio integrado e produção pendentes.

Atualização: responsável informou BUILD SUCCESS no verify e confirmou teste manual bem-sucedido na conversa.
