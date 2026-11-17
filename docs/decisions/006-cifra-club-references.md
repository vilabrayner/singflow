# ADR 006 — Referências de cifras

Data: 16/11/2026. Escopo autorizado: descobrir e guardar links do Cifra Club.

## Busca e confirmação

O backend consulta a interface pública usada pelo site, em `https://solr.sscdn.co/cifraclub-explore/v1/search`. Ela não é uma API documentada para terceiros e pode mudar. Na primeira página, `type=all` fornece `top_result` e `type=songs` fornece a lista de músicas; as seguintes usam apenas `songs`. Apenas resultados de música com artista e slugs válidos são aceitos, sem duplicação de URLs. `top_result` aparece primeiro e fica pré-selecionado quando não existe referência anterior nem edição do usuário. Selecionar/pesquisar nunca salva ou aprova: confirmar é obrigatório. O indicador `verified` do provedor não equivale à aprovação do SingFlow.

A prova de conceito confirmou os slugs de Giz/Legião Urbana e The Scientist/Coldplay no Chrome real. As páginas dessas músicas retornaram 403 por HTTP e no navegador automatizado deste ambiente, mas o endpoint de busca retornou 200. Construir um slug sozinho não comprova que a página existe. O usuário pode abrir a sugestão para conferir a versão; não extraímos nem armazenamos o conteúdo da cifra.

Há timeout de conexão de 3 s e leitura de 5 s, cache de 5 minutos/200 consultas e limite de 60 buscas por minuto por instância. A primeira página faz até duas chamadas ao provedor. Falhas são visíveis; o preenchimento manual continua disponível. `SINGFLOW_CIFRA_SEARCH_ENABLED=false` desliga somente a pesquisa externa.

## Persistência e permissões

- Admin grava a referência oficial em `catalog_songs.chords_url`, com versão e auditoria. Isso não altera a situação de aprovação da música.
- Músico aprovado escolhe sua preferência por conta e música, mediante acesso à sessão e presença da música nela. A preferência acompanha seu perfil nas demais sessões autorizadas.
- Precedência: preferência pessoal → referência oficial → busca ou link manual. Remover a preferência volta à referência oficial atual.
- A V20 cria preferências e auditoria. Atualizações usam controle de versão e bloqueio; o servidor identifica o ator pela autenticação. Proteções de CSRF e papéis permanecem ativas.
- URLs aceitas: HTTPS no domínio Cifra Club, caminho de música/versão, sem credenciais ou porta explícita. O servidor não acessa URLs arbitrárias fornecidas pelo usuário.

Unificações transferem os vínculos e a auditoria para a música definitiva. Se duas preferências pessoais conflitam, a do destino permanece e a outra vira alternativa para escolha explícita; não há substituição silenciosa. Excluir uma música com preferência ou auditoria associada é bloqueado. Resetar uma preferência conserva versão e rastreabilidade.

Spotify, YouTube, letras, execução de áudio e sincronização automática em lote não fazem parte deste incremento.


### Tom ao abrir a cifra

No palco e na fila do músico, o link de navegação recebe `keyShape` apenas se houver tom original válido e alteração inteira diferente de zero. O índice absoluto começa em A=0, Bb=1, B=2, C=3, Db=4, D=5, Eb=6, E=7, F=8, F#=9, G=10, Ab=11, conforme tabela conferida pelo responsável. Exemplos: D −2 → C (`3`); C +2 → D (`5`). Sem os dois dados, remove-se `keyShape` inclusive se já existir no link salvo. Outros parâmetros e a versão da cifra permanecem; o catálogo e a preferência pessoal não são modificados. O parâmetro codifica a altura da nota, sem adicionar parâmetro de modo maior/menor. Conferir manualmente a abertura na página externa. Sem migration nova.
