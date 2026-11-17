# Aceite 033 — StreamingSearch com Spotify

## Configuração

No `.env` da raiz, para o backend local: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_MARKET=BR`. O launcher Java local existente lê o arquivo. Não colocar segredos no `.env.example` ou frontend. A flag `SINGFLOW_SPOTIFY_SEARCH_ENABLED=false` desativa apenas a consulta externa; o link manual permanece. O Compose local encaminha essas variáveis. Na hospedagem, configurar o mesmo conjunto no backend em etapa própria; este incremento não alterou a AWS.

Reiniciar backend pela IDE para carregar os adaptadores e credenciais. Não há migration nova. Sem commit, push ou deploy.

## Roteiro

1. Admin → Catálogo → informações de uma música → opções → Streaming. Spotify aparece como plataforma disponível.
2. Conferir a busca inicial por título/artista, álbum, duração e abertura para conferir a versão. Pesquisar/carregar mais não salva nada.
3. Selecionar uma versão e salvar. Reabrir e verificar a referência; remover e conferir o desaparecimento do link.
4. No músico autorizado, conferir o botão Spotify no palco/próximo e na fila. A cifra permanece disponível com seu ícone e regra de tom; o Spotify não recebe `keyShape`.
5. Simular busca desativada: informar um link manual de faixa. URLs de playlist, outro domínio ou protocolo devem ser rejeitadas.
6. Duas edições simultâneas não devem se sobrepor silenciosamente. Uma atualização desatualizada apresenta conflito e mantém o formulário.
7. Unificar a música em outra sem referência: o link deve acompanhar a música definitiva. Músico com acesso revogado não deve obter a sessão.

## Validação

O responsável executou `./mvnw -B verify`: BUILD SUCCESS. Nove testes focados sem banco passaram antes disso. Cobrem autenticação simulada, renovação de token, paginação/cache, 429/cooldown, validação de links e registro genérico de provedores. O PostgreSQL temporário valida permissões, CSRF, auditoria, versão, concorrência e unificação. Dois testes puros do frontend e 32 cenários de navegador passaram com API simulada em desktop/celular; build aprovado. Integração real com as credenciais preenchidas e conferência em celular físico ficam para o ensaio do responsável.


## Economia de consultas ao reabrir referências

Ao abrir Streaming ou trocar a plataforma selecionada, uma referência já
associada é carregada sem consultar sugestões preparadas nem disparar pesquisa
externa. O link continua visível e editável. A pesquisa explícita permanece
habilitada para escolher uma nova versão. A regra é por plataforma: um link
Spotify não impede buscar YouTube quando este ainda não possui referência.

Sem vínculo, permanece o fluxo de sugestões preparadas e, na ausência delas,
busca externa. O processamento automático existente continua verificando vínculos
antes de consultar provedores, preservando referências oficiais.

Validação: build do frontend concluído e 12 testes Playwright passaram
(desktop e mobile, API simulada), incluindo reabertura sem busca, troca de
plataforma e pesquisa explícita para substituição. Sem migration nova.
