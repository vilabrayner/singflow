# ADR 009 — Enriquecimento de músicas novas de pedidos

Data: 16/11/2026. Escopo autorizado: buscar letra, cifra, Spotify e YouTube em segundo plano para músicas criadas por pedidos. Letra apenas no cache; links como sugestões persistidas, sem aprovação automática.

## Origem e persistência

`CatalogService.register` publica `SongEnrichmentRequested` somente quando precisa criar uma música canônica. O tratamento do evento participa da mesma transação e insere uma tarefa por música/provedor; não acessa a rede. Rollback do pedido também desfaz as tarefas. Pedidos adicionais ou reenvios da mesma operação reutilizam a música e não geram outro lote. Cadastros administrativos e músicas anteriores à migração não recebem backfill automático.

A V21 cria `catalog_enrichment_jobs` e `catalog_enrichment_candidates`. A chave música/provedor evita duplicação. A tarefa registra título/artista usados na consulta, estado, tentativas, próxima tentativa e uma concessão temporária com token. Os candidatos guardam no máximo dez resultados por recurso (ID externo, metadados e URL), nunca o texto da letra. Migrações anteriores permanecem inalteradas.

Estados: `QUEUED`, `PROCESSING`, `READY`, `NOT_FOUND`, `COMPLETED` (letra processada), `FAILED`, `SKIPPED` e `WAITING_METADATA`. A letra usa o mesmo `LyricsSearch`/cache da antecipação na convocação; completar a tarefa não garante que a letra foi encontrada, apenas que a consulta terminou sem erro. O painel do participante continua exibindo os estados reais do cache/provedor.

## Execução e concorrência

O worker consulta a fila a cada dois segundos e executa uma tarefa de cada vez em thread própria. Nenhuma consulta externa mantém transação/bloqueio do catálogo. O claim é persistido em transação curta com bloqueio, token e lease de dois minutos; outro worker não processa o mesmo claim. Ao reiniciar, tarefas enfileiradas permanecem e claims expirados podem ser retomados. Respostas de tokens antigos são ignoradas.

Falhas têm até três tentativas, com espera crescente e respeito a Retry-After (inclusive cota diária do YouTube). Uma falha não impede os demais provedores nem o pedido. As proteções de cache, limites e credenciais dos adaptadores continuam valendo. Letras são priorizadas entre tarefas com a mesma disponibilidade.

Antes de consultar e antes de salvar resultados, conferir música ativa, título/artista e ausência de referência oficial. Correção dos metadados invalida candidatos antigos e permite nova preparação; falta de artista aguarda correção no catálogo. Alteração apenas de tom ou aprovação não refaz consultas desnecessariamente. Referências oficiais ou preferências pessoais existentes não são substituídas.

Na unificação, tarefas são transferidas à música definitiva, colisões são reunidas por provedor, candidatos antigos/claims em voo são invalidados e o worker usa os dados definitivos. Links oficiais herdados são preservados e dispensam nova busca. Uma música com tarefas associadas também atende à regra de bloqueio de exclusão por qualquer associação.

## Revisão

`GET /api/admin/catalog/songs/{song}/enrichment/{provider}` entrega o estado e candidatos somente a administradores. Respostas não entregam candidatos desatualizados ou de música indisponível. `REFERENCE_SET`, `STALE` e `NOT_SCHEDULED` são estados de apresentação calculados na leitura.

As modais existentes de cifra oficial e streaming leem primeiro as sugestões preparadas. Abrir a modal não refaz a pesquisa externa quando há uma tarefa conhecida; Atualizar sugestões preparadas consulta só o banco. A busca manual permanece disponível. Para músicas sem tarefa, o fluxo anterior de pesquisa continua. O top_result da cifra pode vir pré-selecionado, mas gravar a referência oficial exige confirmação. Spotify/YouTube exigem escolha explícita; as gravações continuam com autorização, auditoria e versão do catálogo.

Preferências pessoais de cifra do músico e a exibição de letras após aceite não mudam. A antecipação de letra na convocação permanece como reforço quando o cache expirar.

## Configuração

`SINGFLOW_ENRICHMENT_ENABLED=true` habilita o agendamento por pedidos e leitura do worker. `SINGFLOW_ENRICHMENT_WORKER_ENABLED=false` pausa o consumidor mantendo tarefas persistidas para retomada. O Compose local encaminha ambas; nenhum serviço AWS foi alterado. Provedores usam suas configurações existentes. Sem nova fila ou infraestrutura externa.


A política de cache de letras foi atualizada: o enriquecimento chama `LyricsSessionCache.findForSong`, que identifica sessões abertas consumidoras da música. Sem sessão aberta, não busca texto. Letra encontrada permanece em memória até o encerramento da última sessão consumidora, conforme ADR 008; os candidatos de links persistidos não são apagados com o cache.
