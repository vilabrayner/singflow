# Aceite 034 — YouTube no StreamingSearch

Configuração local no `.env` da raiz: `YOUTUBE_API_KEY`. Opções: `SINGFLOW_YOUTUBE_SEARCH_ENABLED=true` e `YOUTUBE_SEARCH_LIMIT_PER_DAY=100`. O launcher Java local existente carrega o arquivo. O Compose encaminha as três variáveis ao backend. `.env.example` contém somente os nomes/modelos; nenhuma chave foi lida ou exibida durante a implementação. Reiniciar o backend pela IDE para carregar o novo adaptador. Sem migration nova, commit, push ou publicação.

## Ensaio integrado

1. Admin → Catálogo → informações da música → opções → Streaming. Selecionar YouTube. Conferir título e canal dos vídeos, usar Carregar mais e abrir uma versão para conferência.
2. Escolher e salvar explicitamente: apenas o link oficial do YouTube é alterado. Spotify e cifra permanecem.
3. Músico autorizado → palco/fila: conferir os ícones Spotify e YouTube lado a lado, abrindo cada plataforma correta. A regra de tom aplica-se somente à cifra.
4. Reabrir a modal e remover a referência YouTube; o Spotify deve continuar disponível.
5. Colar um link youtu.be ou shorts de vídeo válido: deve ser normalizado para watch. URL de playlist, domínio semelhante ao YouTube ou ID inválido deve ser recusada.
6. Com busca desativada ou cota esgotada, conferir mensagem e possibilidade de preencher o link manualmente. Os links salvos continuam funcionando.
7. Em uma busca longa, deixar expirar o cursor e tentar Carregar mais: pesquisar novamente deve renovar os resultados sem misturar páginas da consulta antiga.

## Validação

Compilação e 17 testes focados sem banco passaram; a proteção adicional de renovação de páginas foi conferida em execução focada. O responsável executou `./mvnw -B -Dtest=StreamingResourcesIntegrationTests test` com BUILD SUCCESS: persistência simultânea com Spotify, remoção, permissões/CSRF e unificação em PostgreSQL temporário. O provedor é simulado; ensaio com a chave real e celular físico permanece com o responsável. Build aprovado, três testes puros de navegação/ícones e 28 cenários de interface em desktop/celular passaram com API simulada, incluindo seleção, carregamento incremental, remoção do YouTube e coexistência com Spotify.
