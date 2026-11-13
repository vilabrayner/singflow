# Convocação: booleano opcional e erro JSON — 13/11/2026

## Causa reproduzida

Frontend omitia allowOutOfOrder quando falso. Na versão atual do Jackson, o record com boolean primitivo rejeitava campo ausente/null com HttpMessageNotReadableException antes de executar o serviço. Teste sem banco reproduziu 400 para os dois casos antes da correção. Em execução servlet, o erro padrão não tratado chegava ao navegador como 403 genérico, ocultando a falha de leitura registrada no backend.

## Correção

- Frontend envia allowOutOfOrder explicitamente como boolean; somente true autoriza convocação fora da ordem.
- DTO aceita Boolean e converte com Boolean.TRUE.equals: ausência e null equivalem a false, preservando clientes anteriores.
- ApiErrors trata HttpMessageNotReadableException com ProblemDetail 400 e mensagem segura, sem encaminhamento ao erro padrão nem detalhes do parser.
- CSRF, autenticação, autorização e regras da fila preservadas. Nenhuma migration.

## Validação

Build frontend aprovado. Cinco testes focados do backend passaram: booleano ausente/null/false/true e JSON inválido com resposta tratada. Acrescentado teste integrado garantindo 400 para JSON inválido autenticado com CSRF e 403 sem CSRF. Responsável solicitado a executar verify e reiniciar o backend pela IDE para ensaio no aparelho.

Oito testes de navegador de convocação/ordem/resultado passaram em desktop e celular. Responsável informou BUILD SUCCESS no verify completo após a correção. Ensaio no aparelho após reiniciar permanece a conferir.
