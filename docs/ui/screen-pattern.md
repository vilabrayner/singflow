# Padrão atual de telas do SingFlow

Referência atualizada em 14/11/2026. A UI do anfitrião foi aceita pelo responsável; o participante foi adaptado a esse padrão neste incremento. Este documento orienta mudanças futuras e prevalece sobre os desenhos exploratórios antigos quando houver divergência de layout. Regras de negócio continuam nas respectivas especificações.

## Identidade e componentes

- Manrope; marca aprovada via `BrandLogo`, com imagens responsivas próprias. Não redesenhar a marca com ícones genéricos.
- Azul-marinho `#0B1E3F` para texto; roxo `#7C3AED` para ação principal/seleção; amarelo `#FBBF24` para destaque; base clara `#F4F6FA`. Cinzas auxiliares nos tokens compartilhados de borda e texto secundário.
- Angular e PrimeNG continuam como base. Ícones explícitos usam `@fortawesome/fontawesome-free` 7.3.1, fixado no package.json/lockfile e servido por CSS/fontes locais, sem CDN. Preferir `fa-solid`; Favoritas usa `fa-regular fa-star`. Passar classes completas aos componentes compartilhados, como `fa-solid fa-music`; não concatenar prefixos de outra biblioteca.
- A [tabela de migração aprovada](icon-migration-proposal.md) define o vocabulário. Escolhas específicas: Catálogo `fa-music`, Mais cantadas `fa-ranking-star`, Músico `fa-guitar`, Chamar/cantar `fa-bullhorn`, Sincronizar `fa-rotate`. Usar `fa-spin` para carregamento. PrimeIcons não é mais dependência direta; os SVGs internos de PrimeNG continuam a cargo da biblioteca.
- Componentes compartilhados: `PanelHeader`, `BottomNavigation`, `SurfaceCard`, `StatusBadge`, `MenuPopover`/`OptionsMenu`, `ConfirmationDialog`, `HistoryItem`, `CatalogSongPicker` e `SongChoiceTabs`.
- Preferir os componentes e tokens existentes a copiar HTML/CSS de outra página. Confirmar as opções de cada componente antes de criar uma variante.

## Estrutura da tela principal

```text
HEADER FIXO: marca à esquerda | nome da sessão à direita | menu
ÁREA CENTRAL: ScrollArea PrimeNG com o conteúdo da aba ativa
DOCK FIXO: ícones e rótulos das áreas principais
```

O header conserva a altura atual, aproximadamente 73px. Não adicionar uma segunda linha para o contexto da sessão. O nome tem largura flexível, alinhamento à direita, fonte de 14px e espaçamento normal entre letras, com reticências quando necessário. Nome completo e situação ficam no menu. Usar a classe compartilhada `sf-panel-context` em novos painéis; o anfitrião mantém sua classe equivalente existente.

A área principal considera `--sf-header-height`, `100dvh` e a altura real emitida pelo dock. Largura máxima de 920px, centralizada no desktop; padding lateral de 16px na área principal. A página permanece parada: quem rola é o viewport do ScrollArea. Não usar `window.scrollTo` para alternar abas.

O dock usa `BottomNavigation` e seu CSS próprio. Abas iguais em largura, sem arredondamento, ícone sobre texto, seleção em lilás/roxo, fundo branco e borda superior. Respeitar a área segura inferior. O ResizeObserver informa sua altura real; não restaurar padding comum removido do dock.

Cada aba preserva sua posição de rolagem. Manter componentes com estado enquanto apenas se troca a visibilidade, usando `hidden` com regra explícita de display. Dados pesados podem ser carregados na primeira visita. Instâncias e estado devem ser reiniciados ao mudar a identidade/participação, sem reutilizar dados de outra pessoa.

As telas de entrada, criação ou acesso indisponível não exibem dock. Seus cards são centralizados quando houver espaço; formulários longos continuam alcançáveis por rolagem nativa. Não fixar formulários de entrada em uma altura que os corte.

## Header e menus

Informação comum às abas fica no menu do header, não em um card repetido. Itens alinhados à esquerda, com ícones decorativos e nomes claros. Separar saída/esquecimento de acesso das demais ações com linha horizontal. Nome completo e status são texto; não depender só da cor.

Acionadores de menu são cinza claro, com área de toque definida. Menus usam máscara `var(--p-mask-background, rgb(0 0 0 / 40%))`, foco contido e Escape/toque externo para fechar. Capturar/restaurar foco sem deslocar a rolagem. Uma ação única deve virar botão direto com rótulo acessível, não um menu de um item.

O SpeedDial experimental continua disponível como componente, mas não é mais usado no antigo card da sessão. Não alterar todos os menus para SpeedDial sem nova decisão de UX.

## Cards e itens

Cards brancos com borda, raios e espaçamento de `SurfaceCard`. Títulos claros, sem repetir o nome da sessão em cada aba. Ações principais têm largura total e roxo; ações secundárias usam contorno/neutro. Evitar instruções repetidas e controles duplicados.

Itens de pessoas, pedidos e histórico seguem painéis com borda de 1px, raio de 12px e intervalo de 12px. Texto principal com aproximadamente 17px/peso 800; artista/informação secundária com 14px e cor atenuada; texto longo quebra sem causar rolagem horizontal. Status fica visível e, no histórico, alinhado à direita.

A faixa lateral é cinza `#E7EBF2`, ocupa toda a altura do item e tem número em cinza escuro. Só itens reordenáveis têm grip e comportamento de arraste. Histórico usa faixa estática, sem aparência de controle. Numeração de participações é decrescente, com a mais recente no topo. Pedidos cancelados sem participação podem usar ícone estático na faixa; não inventar ordem de execução ou horário de cancelamento.

Botões de editar, cancelar, chamar, pausar e revogar têm borda e área de toque explícita. Ícones isolados exigem `aria-label`; ícones acompanhados por texto usam `aria-hidden`. Alvos de toque têm no mínimo 44px; usar o token de 48px quando aplicável. Não depender de tooltip para explicar uma ação no celular.

No arraste CDK, manter largura, grid, tipografia e faixa também no preview movido para o body. Não depender apenas de seletores ancestrais da página. Registrar o viewport em `CdkScrollable` para rolagem automática nas bordas. Reordenação deve ter alternativa por teclado, respeitar estado ocupado e detectar listas alteradas durante o gesto.

## Modais e catálogo

`ConfirmationDialog` é o contêiner comum, com título, conteúdo e ações consistentes. Extras ficam no menu do título; não espalhar ações secundárias no corpo. Confirmações de ações importantes permanecem em diálogos. A ordem usual é ação de confirmar, depois voltar/cancelar; no celular, botões em coluna e espaçamento regular.

Seleção de música em fluxos que ainda usam diálogo segue modal quase em tela inteira, preservando margem/borda de 12px no celular e 24px no desktop. Título fixo; busca e orientação na faixa branca abaixo do título (`dialog-subheader`); apenas resultados na área cinza com ScrollArea; rodapé branco fixo. Não colocar instrução fixa no meio da listagem cinza.

O catálogo tem busca a partir de três caracteres com debounce, consulta incremental de até dez músicas e botão Carregar mais no final. Acrescentar resultados sem apagar os anteriores ou perder a rolagem; deduplicar título/artista. Falhas permitem repetir a mesma página, e respostas de buscas antigas são descartadas.

A origem pode aparecer como Catálogo ou Internet. Item já pendente recebe fundo lilás e check, sem botão de adicionar. Inclusão usa `+`; troca usa ícone de troca. Texto livre é oferecido a partir do texto pesquisado, com artista opcional e confirmação na própria lista, sem redigitar o título ou mudar de tela. Somente a prova de seleção emitida pelo backend autoriza aprovação automática de resultado externo.

Favoritas e Mais cantadas permanecem preparadas visualmente, sem simular personalização antes do cadastro de participantes. A inclusão de músicas do participante acontece exclusivamente na aba Catálogo; Pedidos não tem botão de adicionar. A troca de um pedido existente também usa a aba Catálogo: o SpeedDial de cada pedido oferece Trocar e Configurar (esta última desabilitada). Trocar ativa o ícone `fa-right-left` e indica o pedido de destino, com opção de cancelar a troca. Ao concluir, voltar a Pedidos; ao cancelar, mudar de aba, receber nova convocação ou perder elegibilidade, encerrar o modo de troca. O botão de excluir permanece separado. Não abrir modal para trocar música no painel do participante.

## Contrato por experiência

### Anfitrião

Dock: Fila, Participantes, Histórico, Músicos. Criar participante fica em Participantes. Músicos têm busca no topo e itens com revogação direta confirmada. Fila tem QR direto, convocação de pessoa elegível, pausa/retomada e arraste. Na convocação, nome abre detalhes, música/artista ficam juntos e as ações secundárias são visíveis. Detalhes de participantes permanecem no fluxo de modal.

### Participante

O card do Catálogo ocupa a altura disponível entre header e dock, sem título repetido. As três abas são seu topo, sem padding externo. A primeira aba arredonda apenas o canto superior esquerdo e a última apenas o superior direito, acompanhando o raio interno do card (raio externo menos a borda). Os cantos internos permanecem retos para não cortar o contorno das abas. Busca e orientação ficam em branco, fixas abaixo das abas; somente a lista e suas ações rolam no ScrollArea interno. O card não cresce com mais resultados nem provoca rolagem da página.

Dock: Pedidos, Catálogo, Histórico. Pedidos reúne status e escolhas, sem botão de adicionar; Catálogo adiciona músicas diretamente e mantém a busca ao alternar abas; Histórico mostra apresentações e pedidos cancelados. Header traz sessão e menu com nome da pessoa, situação, atualização e saída/esquecimento conforme o estado permitido.

Uma nova convocação leva a Pedidos e mostra o aviso central. Se a pessoa navegar para outra aba com chamada ativa, há atalho visível para a convocação. Não exigir aceitação para refletir a conclusão efetuada pelo anfitrião: a próxima resposta do backend deve voltar ao estado da fila. Manter pausas, faltas, saída/retorno, acesso por aparelho, troca de música pendente e bloqueio da convocada.

### Músico

Dock: Palco, Fila e Histórico. O header mostra a sessão aberta e o menu da conta, com atualização, escolha de sessão e saída separada. Não repetir o card de sessão em cada aba. Palco concentra a convocação e a próxima sugestão; Fila mantém a lista completa pesquisável, com posição original mesmo ao filtrar; Histórico usa o componente compartilhado de itens, sem horários.

Sessões encerradas permanecem em modal dentro do seletor. Sem sessão aberta, mostrar o card centralizado de espera, sem dock. Encerramento ou revogação elimina os dados atuais e volta à espera; troca de sessão reinicia aba, busca e rolagem. O músico não pode convocar, pausar ou concluir. A exceção à consulta é registrar o tom efetivamente cantado em apresentações em andamento ou concluídas das sessões às quais continua vinculado.

### Administração

Dock: Cadastros, Sessões e Catálogo. Header mantém a marca, contexto Admin e menu Opções da administração com Sair da conta e rodapé de versão. A rota administrativa continua fora dos menus públicos. Consultas e decisões permanecem nos diálogos existentes; catálogo e sessões são carregados na primeira visita, preservando filtros ao alternar abas. Logout limpa as instâncias e seus dados.

Listas de cadastros, sessões e sincronização usam painéis com borda, raio de 12px e faixa cinza estática para o ícone, sem grip. O catálogo segue a lista musical do participante, sem faixa lateral. Confirmações, auditoria e controle de versão continuam preservados. Ao sair da aba Catálogo com sincronização pendente, destruir somente a tela de sincronização e manter o aviso de revisão; o processamento persistente não é cancelado.

Músico e admin reutilizam `PanelWorkspace` para o ScrollArea e dock. O componente preserva rolagem por aba, mede a altura real da navegação e reinicia posições quando muda a chave de contexto. `StageQueue` e `StageHistory` compartilham a apresentação de consulta. Somente o viewport central rola; a página permanece parada.

## Feedback, concorrência e validação

Sucessos aparecem em toast abaixo do header. Erros de formulário ficam junto do campo quando aplicável; erros de ação ficam no diálogo correspondente. Não confirmar sucesso sem confirmação da API. Preservar preenchimento e identificador da operação em reenvios. Desabilitar ações conflitantes durante gravação.

Não alterar isonomia da fila, permissões ou persistência como efeito de uma mudança visual. Atualização por polling permanece; não apresentar notificações como WebSocket enquanto não houver essa implementação.

Antes de concluir uma alteração, validar desktop e celular, largura de 320px, nomes longos, foco e teclado, encerramento/perda de acesso, falha de conexão, menus após rolar e arraste quando aplicável. Registrar testes com API simulada como tal. Teclado virtual, gestos nativos e área segura exigem ensaio físico; não afirmar que emulação cobre esses comportamentos.

## Formulários em dispositivos de toque

Não abrir o teclado virtual nem selecionar opções automaticamente ao abrir um formulário. Manter rótulos, leitores de tela e navegação por Tab quando houver teclado conectado. O campo recebe foco por toque explícito; ações por teclado continuam podendo direcionar o foco ao primeiro campo.

Exceção ao ScrollArea do anfitrião: enquanto o cadastro de participante estiver aberto em dispositivo de toque, usar fluxo natural do documento, sem ancestral fixo envolvendo os campos. Header e dock permanecem fixos; ao sair do cadastro, as abas retomam a rolagem interna. Essa exceção reduz a exposição a deslocamentos de toque do WebKit após fechar o teclado. Emulação não substitui teste físico no Safari.

Ao concluir o cadastro assistido com sucesso, abrir a aba Fila, retirar o foco dos campos e restaurar a rolagem do painel no topo. A navegação de conclusão não deve ser rejeitada pelo bloqueio temporário de atualização dos dados. Falhas mantêm o formulário e o identificador da operação para reenvio.

## Catálogo administrativo com abas — 15/11/2026

O catálogo do admin reutiliza a classe `sf-catalog-card` do participante: card na altura disponível, abas no topo com ícones `fa-book` (Catálogo) e `fa-rotate` (Sincronizar), contorno roxo na seleção e cantos superiores externos arredondados. O título do card fica disponível para leitores de tela, sem repetir o texto visualmente.

A busca e a barra de gestão ficam fixas na faixa branca. Somente a lista do Catálogo rola no ScrollArea cinza, com sombras internas acima dos itens e sem interceptar toques. O admin mantém todas as situações, filtros e ações de cadastro/edição/aprovação/rejeição/unificação/histórico. A lista carrega dez itens por vez, com “Carregar mais” ao final; falhas preservam os resultados já carregados. Cada item mostra título e artista, com botões de informação e exclusão à direita. A situação aparece somente no diálogo de informação. A exclusão exige confirmação e é bloqueada por qualquer associação de uso, inclusive pedidos cancelados, apresentações, sincronizações e unificações. A auditoria permanece preservada. Não usar a API pública do participante para gestão administrativa.

A pesquisa administrativa é automática a partir de três caracteres, com espera de 400 ms após a digitação. Consulta primeiro o catálogo e complementa com a Internet via backend. Selecionar o botão de adição de um resultado Last.fm cadastra a música automaticamente usando a seleção comprovada pelo backend; reenvios reutilizam a mesma operação. Resultados já locais continuam com informação e exclusão.

Sincronizar integra o processamento existente em outra aba, com ScrollArea próprio. Exibir somente itens que precisam de intervenção; aprovados automaticamente ou já resolvidos não entram nessa lista. Quando não restar nenhuma provisória do lote, mostrar “Sincronização finalizada com sucesso” e limpar a área para uma nova sincronização, permanecendo na aba. Limpar a tela nunca apaga o histórico persistente. Voltar ao Catálogo preserva os filtros; sair com pendências preserva o warn e não cancela o processamento. O dock administrativo permanece Cadastros/Sessões/Catálogo. Esta atualização de 16/11/2026 substitui o retorno automático ao Catálogo descrito no aceite 029.


## Configuração musical — 16/11/2026

Nos pedidos do participante, o SpeedDial mantém Trocar e habilita Configurar. O diálogo Configurar música mostra título, tom original (ou Não informado) e o campo Mudar tom: padrão zero, digitação inteira e dois botões de 48px com carets para diminuir/aumentar um semitom. Limites -24 a +24; validação junto do campo e erro de gravação no diálogo. Salvar/Voltar seguem o espaçamento padrão. Não focar automaticamente o input em dispositivos de toque. Só pedidos pendentes de participante ativo em sessão aberta podem ser configurados.

O painel do músico mostra Tom: Original, Tom: D (Original), Tom: +1, Tom: -2 ou Tom: C conforme a existência de original e a transposição. Não acrescentar “semitons” ao valor exibido nessa linha. O tom efetivamente cantado aparece em linha separada, preenchido no diálogo Tom cantado por músico vinculado, pelo palco ou histórico. Histórico de sessões anteriores mantém o fluxo dentro das modais e usa o ID da sessão consultada.

Admin cadastra o tom original no formulário de música. Catálogo, pedidos e histórico mostram sempre título/artista atuais do catálogo; unificadas não aparecem na pesquisa nem nos filtros. A unificação transfere os vínculos e remove o cadastro absorvido, preservando a auditoria. Detalhes técnicos em [ADR 005](../decisions/005-canonical-music-and-performance-keys.md).


### Referências de cifra

Usar `ChordActions` nos itens do palco/fila do músico: ícone `cifra-club-icon.png` (palheta preta com recortes transparentes) para abrir a referência efetiva e botão de busca para escolher a versão pessoal. Preservar rótulos acessíveis e a área de toque do botão compartilhado. `ChordLinkDialog` usa a modal comum, lista de sugestões, link manual e confirmação explícita, distinguindo “Cifra oficial” (admin) de “Minha cifra” (músico). A sugestão principal pré-selecionada não representa vínculo salvo. Alternativas de unificação exigem escolha explícita.


### Streaming

Usar `StreamingSearch` para pesquisar/confirmar a referência administrativa e `StreamingActions` para abrir links no painel do músico. O JSON fornece `type`, `label` e `icon`; o registro de apresentação valida a combinação e escolhe Font Awesome Brands (`spotify`/`fa-spotify`, `deezer`/`fa-deezer`). Apenas provedores instalados aparecem no seletor. A modal mantém erro visível, consulta sem persistência automática, álbum/duração para distinguir versões, link manual e ações com espaçamento compartilhado. Adicionar plataforma não exige copiar a modal.


YouTube usa o mesmo seletor/modal de streaming com `type=youtube` e `fa-youtube`; resultados mostram título e canal. O canal é o publicador do vídeo, sem alterar o artista do catálogo. Os ícones das plataformas com links salvos coexistem no palco/fila do músico. Abrir o vídeo faz navegação externa; não há player incorporado.


### Letra durante a apresentação

`ParticipantLyrics` é um componente do card de status, exibido após aceite da convocação, mantendo os três cards do participante. Texto interpolado (sem HTML), fonte de 20 px, quebras preservadas e rolagem interna do painel. Exibir carregamento, falta de artista, letra não encontrada, instrumental ou falha com tentativa manual. A conclusão da convocação remove a letra e descarta qualquer resposta pendente. Não há rolagem ou sincronização automática nesta prova de conceito.


### Sugestões de recursos preparadas

As modais de cifra oficial e streaming consultam primeiro o enriquecimento persistido. Mostrar o estado de preparação e reaproveitar a mesma lista/seleção já existente; Atualizar sugestões preparadas atualiza apenas o banco. A pesquisa manual continua explícita e disponível. Preparação pendente não deve ser apresentada como “nenhum resultado”. Sugestões não equivalem a referências oficiais; o botão de salvar mantém a confirmação do admin. O fluxo pessoal do músico permanece separado.


## Edição administrativa de música em abas

A modal reúne Dados, Cifra, Spotify e YouTube usando TabsModule do PrimeNG e o
estilo compartilhado `sf-song-tabs`, com ScrollArea sombreado e estrutura fullscreen
com bordas visíveis do `ConfirmationDialog`. Apenas a região central rola; o
cabeçalho, a navegação e o rodapé permanecem fixos. Divisórias internas retas e
arredondamento apenas nas duas extremidades superiores.

Cada aba contém somente um ícone centralizado de 20 × 20 px e um rótulo acessível.
O símbolo CifraClub usa máscara CSS `currentColor` para seguir a cor do tema.
Evitar parágrafos redundantes quando os rótulos dos campos explicam a interação.

O rodapé contém apenas Salvar e Fechar. O frontend mantém um rascunho único de
metadados e links, preservado ao alternar abas. O backend recebe esse conjunto em
uma transação, sem consultar provedores externos. Erro ou conflito mantém o
rascunho; fechar descarta. Links não visitados permanecem preservados.

Reutilizar `ReferenceLinkInput` nos editores: x limpa o rascunho, e
`fa-up-right-from-square` abre o destino validado em uma nova aba. Não remover
referências imediatamente nem expor botões de remoção adicionais no rodapé.
Os editores compartilhados continuam disponíveis de forma independente para o
músico; o modo embutido emite rascunhos e solicita salvamento ao editor pai.

Ao abrir os detalhes de uma música, consultar uma única vez
`GET /api/admin/catalog/songs/{id}/details`: dados atuais, versão, cifra oficial e
links/metadados dos provedores instalados. Essa leitura usa uma transação somente
de leitura com snapshot consistente e não chama provedores externos. Não ampliar
a listagem inteira do catálogo com dados necessários apenas ao editor.

A aba Dados abre primeiro. Montar as demais somente na primeira visita e manter
suas instâncias enquanto a modal estiver aberta, usando os dados iniciais como
entrada. Alternar abas não dispara GETs nem loading e preserva campos, resultados,
paginação e seleção. Cada instância de streaming precisa de IDs de campos e grupo
de radios próprios; os rótulos devem apontar para o input da plataforma correta.

Sem referência nem rascunho, a primeira visita pode consultar sugestões preparadas
e, quando necessário, buscar no provedor. Pesquisar, carregar mais e atualizar
sugestões continuam ações explícitas. Evitar consultas externas ao abrir vínculos
existentes ou retornar a rascunhos. Fechar descarta o estado em memória; reabrir
consulta novamente os dados completos e a versão atual. O salvamento atômico e a
proteção de conflito de versão permanecem obrigatórios.


## Carregamento de tela inteira

Usar uma única instância de `LoadingRegion`, montada no app root, com BlockUI em
modo documento e ProgressSpinner. Não envolver cards, listas, formulários ou
ScrollAreas em componentes de loading nem alterar seus contêineres, altura,
posição, foco ou rolagem. O host do indicador usa `display: contents`.

`ApplicationLoading` controla operações simultâneas por contagem. Exibir a máscara
imediatamente e manter por pelo menos 300 ms; ocultar somente depois de terminarem
todas as operações bloqueantes. Esse mínimo é visual e não atrasa as APIs.
O `ApiClient` encerra cada operação em `finally`, inclusive após erro, timeout ou
cancelamento. CSRF e POST compartilham uma operação para evitar piscadas entre eles.
Fluxos que também renderizam QR Code mantêm a operação até a imagem estar pronta.

As consultas automáticas usam `{ background: true }`. Autocomplete e pesquisas
incrementais por digitação usam `{ blocking: false }`, inclusive no catálogo do
admin: o campo deve continuar editável durante a espera. A carga inicial do
catálogo e salvamentos seguem bloqueantes. Não adicionar chamadas externas para
controlar a apresentação do loading.

Para consultas descartáveis (letra e referências), fornecer `signal` ao GET e
abortar ao destruir o editor. Respostas antigas continuam protegidas por geração.
A máscara libera o contador ao cancelar, sem cancelar gravações já autorizadas.
Preservar rótulos acessíveis e foco de validação. Enquanto há requisição bloqueante,
impedir ativação por teclado; o mínimo visual não deve roubar o foco programático.


## Resgate do acesso do participante

O QR Code individual fica disponível ao anfitrião para participantes inscritos
pelo celular (`SELF`) ou pelo anfitrião (`ASSISTED`), na lista e no menu dos
detalhes. Exibir apenas com sessão aberta e participante sem saída registrada.
A origem permanece inalterada; o selo de inscrição assistida continua exclusivo
para essa origem.

Se já houver acesso vinculado, exibir **Gerar QR Code de recuperação** como botão
primário diretamente na modal de acesso, sem menu intermediário. Esse fluxo atende mudança de endereço/IP, perda do acesso ou
troca de aparelho. O convite tem cinco minutos e uso único. Emitir o QR não
revoga o acesso atual; a confirmação do vínculo substitui o acesso anterior,
preservando identidade, chegada, pedidos, histórico e convocação. O anfitrião
confere quem receberá o convite; não criar outro participante para recuperar o
existente. O link usa `SINGFLOW_PUBLIC_APP_URL`, que precisa corresponder ao
endereço acessível aos celulares.


## Histórico do músico

No painel do músico, o histórico usa `HistoryItem` com `statusBelow=true`: nome,
música/artista e tom permanecem na coluna principal, seguidos da badge de status
no rodapé. A ação de registrar o tom cantado ocupa a coluna direita, com botão
`sf-icon-button`, ícone `fa-sliders` e nome acessível incluindo o participante.
Manter a área de toque de pelo menos 44 px e a mesma modal de registro de tom.
O comportamento também vale para sessões anteriores. Histórico do anfitrião e
participante preserva sua configuração atual de badge.

Validação: build frontend concluído; dez testes de tons e padronização passaram
em desktop e mobile com API simulada, incluindo posição da badge, botão à direita,
permissões e gravação em sessão anterior. Não houve alteração de backend.


## Versão no menu do header

Os menus autenticados do header de anfitrião, participante, músico e admin usam
`MenuPopover` com `versionFooter=true`. O contêiner compartilha borda, fundo e
limite de altura; o conteúdo rola separadamente e `VersionFooter` permanece no
rodapé. Menus de cards/modais não recebem esse rodapé.

Exibir `Versão 0.1.0-beta.1` como texto discreto, sem ação, foco ou papel de item
de menu. O componente lê a versão do `frontend/package.json` no build; não obter
a versão por configuração mutável ou nova consulta HTTP. O header mantém sua
altura atual. Admin utiliza menu de conta para abrigar a saída e o rodapé comum.

Manter a mesma versão no package-lock e no `backend/pom.xml`; o teste
`frontend/scripts/version.test.mjs`, incluído em `npm run test:config`, confere a
coerência desses metadados. A criação de tag/release, as tags de imagens e a
publicação serão tratadas na etapa de release, sem serem disparadas pelo build.
