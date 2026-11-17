# ADR 007 — Busca e referências de streaming

Data: 16/11/2026. Escopo aprovado: pesquisa administrativa, escolha explícita do link oficial e abertura no painel do músico. Spotify é o único provedor externo implementado.

## Contratos e extensibilidade

`StreamingSearch` define `provider()`, `search(query,page)` e normalização de URL. `SpotifySearch` implementa Client Credentials, token em memória, renovação única após 401 da API, busca de faixas no mercado configurado, dez resultados por página, até offset 1000, cache de dois minutos/200 buscas e limite local de 60 buscas por minuto/instância. HTTP 429 respeita Retry-After com cooldown; falha externa não equivale a lista vazia. Nenhuma credencial ou token é devolvido ao frontend.

`StreamingReferenceStore` separa a persistência da API externa. `SpotifyReferenceStore` aproveita `catalog_songs.spotify_url`; não há migration nova. `StreamingResources` registra os adaptadores por tipo, rejeita duplicação e ausência de correspondência entre busca/persistência, exige admin para gerenciar e preserva auditoria e controle de versão. O módulo de músicos recebe o mapa de links somente após autorização da sessão. A unificação existente já transfere a referência para a música definitiva.

No frontend, `StreamingSearch` é a modal reutilizável; `StreamingActions` renderiza os links do músico. O JSON fornece tipo, rótulo e ícone. Um registro local de apresentação/navegação permite `spotify` → `fa-spotify` e `deezer` → `fa-deezer`, valida domínio/caminho e evita classes arbitrárias. Deezer não aparece na lista real de plataformas; só existe suporte de apresentação e teste com provedor fictício.

Exemplo de referência:

```json
{"songId":"…","type":"spotify","label":"Spotify","icon":"fa-spotify","url":"https://open.spotify.com/track/…","version":5}
```

Adicionar plataforma requer implementar busca, validação de URL e persistência, registrar os beans, acrescentar sua apresentação/navegação segura no frontend e escrever os testes de contrato. A escolha da estrutura física de persistência do novo provedor será feita no incremento correspondente. O seletor e o restante da modal não precisam de ramificações por plataforma.

## API e comportamento

- `GET /api/admin/catalog/streaming/providers` lista os provedores instalados.
- `GET/POST /api/admin/catalog/songs/{song}/streaming/{type}` consulta/grava/remove o vínculo; POST recebe `version` e `url` (null para remover).
- `GET …/{type}/search?q=…&page=1` pesquisa após autorização; consulta externa não mantém o bloqueio transacional do catálogo.
- A busca exige ao menos três caracteres, permite carregar mais, exibe álbum/duração para distinguir versões e não seleciona/salva automaticamente.
- Link manual segue disponível quando a pesquisa falha ou está desativada. Compartilhamentos Spotify com `/intl-xx/` e parâmetros são normalizados para o link canônico da faixa.
- Preservamos a ordem do provedor, sem ordenar por plays ou popularidade. A API não oferece parâmetro de ordenação nessa busca; `popularity` é um campo depreciado e não é usado.

## Fora deste incremento

Busca em segundo plano ao criar pedido, associação automática, preferências pessoais de streaming, player, novas plataformas e publicação. A proposta de enriquecimento assíncrono será discutida separadamente: por música canônica/provedor, após commit, sem bloquear o pedido, com deduplicação e revisão de correspondências ambíguas.

Fontes consultadas em 16/11/2026: [Client Credentials](https://developer.spotify.com/documentation/web-api/tutorials/client-credentials-flow), [Search](https://developer.spotify.com/documentation/web-api/reference/search) e [Quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes). Acesso real depende das permissões/cotas do aplicativo Spotify; os testes usam provedor simulado.


## Extensão YouTube — 16/11/2026

`YouTubeSearch` e `YouTubeReferenceStore` passam a implementar os mesmos contratos. O adaptador usa a YouTube Data API v3, busca somente vídeos, com relevância, dez resultados por página, região BR e preferência de idioma pt. A credencial `YOUTUBE_API_KEY` fica no backend e é transmitida no header `X-Goog-Api-Key`, sem chave no JSON ou URL. `SINGFLOW_YOUTUBE_SEARCH_ENABLED=false` desativa a consulta, preservando vínculos manuais.

O provedor pagina por tokens opacos, mantidos no servidor e associados à consulta/página. Cache de cinco minutos e no máximo 200 páginas; cursor expirado solicita uma nova busca, sem percorrer silenciosamente todas as páginas anteriores. Renovar a primeira página invalida as páginas anteriores daquela consulta. IDs repetidos são eliminados por página, mantendo a ordem de relevância recebida. A modal mantém sua própria deduplicação incremental.

`YOUTUBE_SEARCH_LIMIT_PER_DAY=100` limita tentativas por instância em memória, com virada do dia em America/Los_Angeles. Falhas também consomem o contador local. A cota real pertence ao projeto Google e é a autoridade: reiniciar o backend reinicia o contador local, e outras instâncias/aplicações também podem consumir a cota. Respostas de cota esgotada e 429 bloqueiam novas tentativas conforme o dia/Retry-After. Não há retry automático. Mensagens preservam a alternativa de link manual.

A API devolve título e canal do vídeo; o canal não é inferido como artista oficial da música. Entidades HTML dos títulos são decodificadas e exibidas como texto. Não consultamos estatísticas/duração, não reordenamos por visualizações e não incorporamos player. `youtube_url`, auditoria, versão e transferência na unificação já existentes são reutilizados, sem migration nova.

O frontend registra `type=youtube`, `label=YouTube`, `icon=fa-youtube`. Links watch, youtu.be, shorts, live e embed são validados e normalizados para `https://www.youtube.com/watch?v=<id>`; playlist/timestamp/rastreamento não são preservados. Uma música pode ter Spotify e YouTube simultaneamente. A UI mostra ambos os ícones e oferece as plataformas no seletor da modal compartilhada.

Fontes: [Search](https://developers.google.com/youtube/data/reference/rest/v3/search/list), [paginação](https://developers.google.com/youtube/data/guides/implementation/pagination), [cotas](https://developers.google.com/youtube/data/determine_quota_cost) e [API keys](https://docs.cloud.google.com/docs/authentication/api-keys-use), consultadas em 16/11/2026.
