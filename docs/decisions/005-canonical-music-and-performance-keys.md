# ADR 005 — Música canônica e tons por pedido/apresentação

Status: aceita em 16/11/2026. Substitui a preservação de título/artista nos pedidos e apresentações introduzida no incremento de catálogo V14.

## Decisão

`catalog_songs` é a fonte única de título e artista. `song_requests` e `stage_calls` armazenam somente `catalog_song_id` para identificar a música. Listas usam consultas com JOIN e projeção, sem carregamento EAGER ou consultas individuais por item. Convocações legadas ainda sem escolha podem ter referência nula; pedidos precisam de música.

Texto livre cria ou reutiliza uma música provisória. Aprovar/corrigir pelo admin ou sincronizar com Last.fm altera o registro existente. Pedidos e apresentações passam a exibir os dados atuais imediatamente na próxima consulta. Valores anteriores ficam na auditoria do catálogo, não em cópias de exibição.

## Unificação

A operação exige destino aprovado, versões atuais e transação única. Transfere pedidos, apresentações, aliases, auditoria, inclusões externas e itens de sincronização antes de excluir fisicamente a música absorvida. Mantém metadados do destino; preenche campos ausentes a partir da origem. As posições de fila, status, participantes e contagens de apresentações não mudam.

`catalog_redirects` preserva apenas o mapeamento de identificadores antigos para o destino e impede recriar um cadastro absorvido por reenvio. Não contém outro cadastro musical. Encadeamentos são achatados. Auditoria e itens de sincronização guardam `original_song_id` como evidência sem FK para a música removida. A unicidade dos itens de sincronização passa a ser por lote e identidade original, permitindo que dois itens antigos convirjam para a mesma música.

A exclusão administrativa comum continua bloqueada por associações; não é um atalho para apagar músicas usadas. Referências de unificação também preservam essa proteção no destino.

## Tom

- `catalog_songs.original_key`: opcional, notação internacional, por exemplo D, Bb ou F#m.
- `song_requests.semitones`: transposição solicitada, inteiro de -24 a +24, padrão zero. Configurável pelo próprio participante em pedido pendente; controle otimista por versão e ID da música.
- `stage_calls.semitones`: transposição copiada ao convocar, independente de alterações posteriores no pedido.
- `stage_calls.performed_key`: tom efetivamente cantado, opcional, registrado por músico habilitado e vinculado à sessão. Pode ser informado durante a convocação ou após a conclusão, inclusive pelo histórico de sessão encerrada com acesso ainda válido. Não altera o catálogo.

Trocar a música limpa a transposição do pedido e incrementa sua versão. Correções de nome não limpam a configuração. Unificação preserva a transposição e invalida configurações iniciadas contra a identidade antiga. O tom efetivamente cantado permanece preservado mesmo se o catálogo for corrigido.

Apresentação no painel do músico, com label `Tom:`:

| Original | Semitons | Valor exibido |
| --- | --- | --- |
| Não informado | 0 | Original |
| D | 0 | D (Original) |
| Não informado | +1 | +1 |
| Não informado | -2 | -2 |
| D | -2 | C |

Modo menor é preservado; transposição usa classes de altura e mantém preferência por bemóis quando o original usa bemol. O tom cantado é exibido separadamente para não representar uma solicitação como execução confirmada.

## Concorrência e reenvios

Ordem dos bloqueios: sessão (quando aplicável), bloqueio transacional do catálogo, linhas alteradas. Unificação não bloqueia sessões. Mutação de status em entidade JPA usa DynamicUpdate, evitando sobrescrever o vínculo que uma unificação acabou de transferir. A identidade do payload original é preservada por fingerprint técnico separado dos nomes mutáveis; não é credencial de segurança.

## Migração e publicação

V19 preserva migrations anteriores, consolida unificações antigas, migra os vínculos e remove as colunas duplicadas. Falha sem descartar dados se encontrar registro musical legado sem referência ao catálogo. Aplicação e esquema devem ser atualizados juntos: a versão anterior do backend depende das colunas removidas. Antes da publicação, gerar backup do banco e testar a migração numa cópia; rollback do backend exige esquema compatível ou restauração do backup, não Flyway repair. Nenhum deploy faz parte deste incremento.

Preferências pessoais persistentes por participante/música, BPM e arranjos continuam fora deste incremento.
