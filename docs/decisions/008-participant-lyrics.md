# ADR 008 — Letras do participante com LRCLIB

Data: 16/11/2026. Prova de conceito aprovada com LRCLIB, letra simples e rolagem manual após confirmação de ida ao palco.

## Contratos e fluxo

`LyricsSearch` é um contrato separado de `StreamingSearch`: a resposta contém status, provedor, título/artista, texto simples e fonte. `LrclibLyricsSearch` usa `/api/get` com título e artista canônicos, identifica o cliente por User-Agent, compara os metadados normalizados (acentos, caixa e pontuação) e aceita somente letra simples. Não seleciona outra música por similaridade e não interpreta letra sincronizada nesta etapa.

A API oferece `FOUND`, `NOT_FOUND`, `MISSING_ARTIST` e `INSTRUMENTAL`; falhas externas usam HTTP 503 e limitação usa 429/Retry-After. Não há texto inventado ou HTML externo executado. Resultados instrumentais e sem letra têm estado explícito na UI.

`GET /api/participation/{session}/calls/{call}/lyrics` usa a credencial existente do participante e o limite de leituras. `AudienceLyrics` consulta o contexto, exige sessão aberta, convocação ativa pertencente à pessoa e ida confirmada. A consulta externa acontece fora de transações de banco. O acesso e os dados da música são conferidos outra vez antes da resposta para impedir exibição de resultados antigos após conclusão/correção/revogação. Resposta HTTP no-store.

No frontend, `ParticipantLyrics` fica dentro do card de status e só é criado para a convocação aceita. Não há quarto card. Recarregamentos do painel com a mesma convocação não repetem a consulta da letra. Alterações de convocação/título/artista invalidam a requisição anterior; destruir o componente descarta respostas tardias. O texto preserva quebras de linha, usa fonte de 20 px e participa da rolagem interna existente. Fonte exibida como link seguro para o registro LRCLIB.

## Operação e limites

Sem chave, migration ou gravação permanente de letras no catálogo. Cache em memória por título/artista, dez minutos para letras e dois para estados vazios, até 100 entradas. Chamadas externas serializadas com intervalo mínimo de 300 ms, timeout de conexão de 3 s e leitura de 5 s. Respeita Retry-After, sem tentativas automáticas em laço. A configuração `SINGFLOW_LYRICS_ENABLED=false` desativa a consulta. `SINGFLOW_LYRICS_CLIENT` identifica aplicativo/versão e URL de contato.

A consulta real por título/artista confirmou letra simples e sincronizada para Giz/Legião Urbana, Like a Prayer/Madonna e The Scientist/Coldplay. Só metadados/disponibilidade foram exibidos durante a prova; letras reais não fazem parte das fixtures. Um erro inicial de certificado no Python local foi isolado e as consultas HTTPS foram concluídas com o cliente do sistema, sem desativar validação TLS.

Não incluídos: realce sincronizado, rolagem automática, associação administrativa de versões, letras no músico, edição manual da letra, enriquecimento em lote e persistência permanente. A conclusão pelo anfitrião sem aceite do participante mantém o comportamento anterior de retorno à fila.

Documentação consultada em 16/11/2026: [LRCLIB API](https://lrclib.net/docs). A integração usa o endpoint estável v1, sem depender da pesquisa v2 beta. Vagalume não foi integrado: documentação oficial indisponível nesta consulta, e o responsável escolheu LRCLIB.


## Antecipação na convocação — 16/11/2026

A busca passa a ser antecipada quando o anfitrião confirma a convocação. `StageService` publica `CallConfirmed` somente ao criar a chamada (ou preencher a primeira música de uma chamada legada). `CallLyricsPreparation` observa o evento após commit e delega ao `LyricsPrefetch`; a rede nunca é consultada na thread/transação da convocação. Rollback e falha da confirmação não iniciam a busca; repetir a operação já confirmada não publica outro evento.

A preparação é best effort, com um worker e fila de até 32 tarefas, deduplicação de músicas pendentes e rejeição sem executar trabalho na thread chamadora. Falha do provedor, saturação ou desligamento não invalidam a convocação. Não existe job persistente nem nova infraestrutura: a consulta após o aceite permanece como fallback e continua revalidando titularidade/contexto. Reiniciar a aplicação pode perder tarefas de antecipação, mas não os dados da fila.

O mesmo cache atende a preparação e o participante. Buscas simultâneas bem-sucedidas da mesma música compartilham a chamada externa; letras já em cache são lidas sem esperar uma consulta lenta de outra música. Cache temporário, identificação do cliente, intervalo entre chamadas e Retry-After continuam preservados. `SINGFLOW_LYRICS_PREFETCH_ENABLED=false` desliga só a antecipação; a flag geral de letras também impede o agendamento.

Os contextos de testes anteriores desativam explicitamente a antecipação para não disparar rede real durante testes de palco. O teste de integração dedicado a habilita com provedor simulado e cobre commit/rollback, idempotência, independência do provedor e ausência de transação no worker. Sem mudança de frontend ou migration.

Referência: [eventos vinculados à transação no Spring](https://docs.spring.io/spring-framework/reference/data-access/transaction/event.html).


## Retenção até o fim da sessão — 16/11/2026

Decisão revisada pelo responsável: letras encontradas ficam em memória durante toda a sessão aberta, substituindo o TTL positivo de dez minutos. `LyricsSessionCache` assume o cache e compartilhamento de consultas; `LrclibLyricsSearch` passa a ser somente o adaptador HTTP/validação/throttling. Não há cópia adicional com TTL no provedor.

Cada entrada é associada às sessões abertas que a consumiram. Uma mesma letra pode ser compartilhada por várias sessões; fechar uma libera somente sua associação, e a entrada é removida quando não restar nenhuma consumidora. O listener de encerramento atua após commit: um encerramento rejeitado ou desfeito não limpa o cache. Resultados de letra não encontrada/instrumental permanecem com TTL de dois minutos enquanto a sessão está aberta, permitindo nova tentativa.

Consulta do participante e preparação na convocação passam o ID da sessão. O enriquecimento por música associa o resultado às sessões abertas que têm pedido/apresentação daquela música; sem sessão aberta não chama o provedor. O estado de abertura é revalidado na consulta e antes de retornar o resultado. Limpar uma entrada não espera rede: a identidade da entrada impede que uma resposta tardia a recrie após encerramento. Consultas pendentes de uma mesma música continuam compartilhadas e entradas prontas não aguardam outra consulta lenta.

Cache continua local à memória da instância, sem gravação de letra no banco e perdido ao reiniciar. A retenção é proporcional às músicas consumidas por sessões abertas, sem o limite anterior de 100 entradas expulsando letras ainda em uso. O limite de tamanho por resposta do adaptador permanece. Sem migration, alteração de frontend ou novas variáveis.
