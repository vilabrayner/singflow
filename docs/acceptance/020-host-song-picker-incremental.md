# Busca e inclusão incremental de músicas — 13/11/2026

## Escopo da modal do participante no anfitrião

- Busca e mensagem de orientação fixas em faixa branca abaixo do título, por projeção dialog-subheader; área cinza usa PrimeNG ScrollArea com somente a listagem e suas ações.
- Título abreviado preservado; rodapé Cancelar música fixo.
- Removida ação Não encontrei minha música nessa modal. O texto pesquisado vira opção Adicionar “título” manualmente ao fim dos resultados. Ao expandir, artista opcional e confirmação aparecem na própria lista, reaproveitando o título; não troca de tela e não aprova automaticamente texto livre.
- Carregar mais acrescenta até dez resultados por consulta sem limpar os itens anteriores, mantendo rolagem. Sem paginação Anterior/Próxima nesse modo.
- Catálogo local vem antes da Internet; sem correspondência local, busca inicial consulta diretamente o Last.fm. Itens repetidos são removidos por título/artista normalizados no cliente, preservando a ocorrência local.
- Falha ao carregar mais mantém lista e cursor para nova tentativa. Mudança de busca reinicia lista/cursor e ignora respostas antigas. Bloqueio de músicas já pendentes preservado.
- Componente compartilhado tem modo incremental opcional; os demais consumidores e suas consultas existentes mantêm comportamento anterior.

## API

- GET /api/public/songs/catalog aceita size=10 (padrão anterior 20 preservado).
- GET /api/public/songs/search-page aceita q, source=catalog|internet e page zero-based. Responde items, nextSource, nextPage, hasMore. Limita itens a dez, consulta local com lookahead e encaminha ao Last.fm usando página one-based.
- Consulta antiga /search continua retornando array. Sincronização administrativa continua usando sua busca anterior.
- Last.fm mantém limite dez, cache por consulta/artista/página, timeout, limite de chamadas e sanitização de erros. Metadados totalResults indicam última página; caso ausentes, página bruta cheia permite tentar sucessora.
- Resultado externo continua recebendo selectionToken emitido pelo backend. Nenhuma migration nova.

Referência oficial de paginação: https://www.last.fm/api/show/track.search

## Validação

Build frontend aprovado; 13 testes focados de backend sem banco passaram. Responsável executou ./mvnw -B verify e informou BUILD SUCCESS, incluindo teste SQL/HTTP com PostgreSQL temporário para tamanho das páginas, ordenação, passagem local/Internet e prova de seleção. Dez testes focados de interface passaram em desktop/celular, incluindo falha/reenvio, deduplicação, busca antiga concorrente e título manual reaproveitado. Regressão completa: 162 cenários aprovados. Após mover também a orientação para a faixa branca e adotar ScrollArea, os 24 cenários relacionados passaram novamente em desktop/celular. Conferência visual mobile realizada.
