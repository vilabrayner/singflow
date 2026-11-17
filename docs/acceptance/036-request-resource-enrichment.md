# Aceite 036 — Recursos de músicas novas

## Preparação

Reiniciar o backend pela IDE para aplicar V21 e carregar o worker. `.env.example` e Compose incluem `SINGFLOW_ENRICHMENT_ENABLED=true` e `SINGFLOW_ENRICHMENT_WORKER_ENABLED=true`. Manter as credenciais existentes de Spotify/YouTube no backend; LRCLIB e busca pública de cifra seguem sem chave. Não houve commit, push, deploy ou alteração de AWS.

## Roteiro integrado

1. Pelo anfitrião ou participante, pedir uma música com título/artista que ainda não exista no catálogo. A criação do pedido deve responder normalmente e a fila continuar utilizável.
2. Aguardar o processamento em segundo plano. Admin → Catálogo → informações da música → Cifra Club/Streaming: conferir as sugestões preparadas. Atualizar sugestões preparadas consulta o estado persistido, sem refazer a busca externa.
3. Confirmar uma sugestão em cada provedor e conferir os ícones no músico. Antes da confirmação, os links não devem ser considerados oficiais nem mudar a situação de aprovação da música.
4. Pedir a mesma música por outra pessoa: reutilizar o catálogo, sem duplicar tarefas. Letra continua disponível após aceite; convocar pode reforçar o cache expirado.
5. Criar pedido sem artista: conferir espera por metadados. Corrigir artista no catálogo e aguardar retomada. Corrigir título/artista durante uma busca deve descartar resultados antigos.
6. Definir uma referência manualmente enquanto a busca está rodando: ela deve ser preservada. Preferências pessoais de cifra também permanecem.
7. Pausar o worker pela flag e reiniciar pela IDE, criar pedido, depois reativar: tarefas pendentes devem ser retomadas. Uma tarefa que estava em processamento pode aguardar até dois minutos pelo vencimento da concessão anterior.
8. Em falha/cota esgotada, conferir aviso e busca manual disponível. O pedido não deve ser revertido. Unificar duas músicas e conferir que os vínculos/tarefas apontam para a definitiva.

## Validação

O responsável executou `./mvnw -B verify`: BUILD SUCCESS, incluindo V21, atualização desde V20 sem backfill, criação por pedido, rollback, idempotência, letra sem persistência de texto, revisão, correção concorrente, lease/retomada, Retry-After, exclusividade de claims e unificação. APIs simuladas e PostgreSQL temporário. O teste anterior de revogação foi corrigido para concluir a apresentação, sair da fila e só então esquecer o acesso, sem alterar a regra do sistema.

Dezesseis testes focados sem banco passaram antes da verificação completa. Build final aprovado e 36 cenários de navegador passaram em desktop/celular com API simulada, incluindo as sugestões salvas sem nova pesquisa e a regressão de letras/cifra/streaming. Ensaio físico/integrado com provedores reais fica com o responsável.


A fixture do teste de permissão passou a cadastrar uma conta MUSICIAN real antes de simular sua autenticação. Antes, a conta inexistente era corretamente recusada com 401 pelo filtro de sessão, impedindo testar o 403 esperado para um músico autenticado sem acesso administrativo. A expectativa de 403 foi preservada. Não houve alteração na autorização de produção ou migrations; compilação aprovada e repetição focada solicitada.


Repetição focada concluída em 16/11/2026: o responsável executou `./mvnw -B '-Dtest=AudienceLyricsIntegrationTests,CatalogEnrichmentIntegrationTests' test` com **BUILD SUCCESS**. As quatro falhas anteriores foram resolvidas pelos ajustes das fixtures; as regras de produção, expectativas de autorização e migrations foram preservadas.
