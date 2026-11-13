# Padrão atual de telas do SingFlow

Referência em 13/11/2026. A UI do anfitrião foi aceita pelo responsável; o participante foi adaptado a esse padrão neste incremento. Este documento orienta mudanças futuras e prevalece sobre os desenhos exploratórios antigos quando houver divergência de layout. Regras de negócio continuam nas respectivas especificações.

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

Ainda possui seu fluxo existente. Uma adaptação futura deve reutilizar este padrão, respeitando o acesso próprio e a consulta sem permissões de gestão do anfitrião. Este documento não autoriza essa etapa automaticamente.

## Feedback, concorrência e validação

Sucessos aparecem em toast abaixo do header. Erros de formulário ficam junto do campo quando aplicável; erros de ação ficam no diálogo correspondente. Não confirmar sucesso sem confirmação da API. Preservar preenchimento e identificador da operação em reenvios. Desabilitar ações conflitantes durante gravação.

Não alterar isonomia da fila, permissões ou persistência como efeito de uma mudança visual. Atualização por polling permanece; não apresentar notificações como WebSocket enquanto não houver essa implementação.

Antes de concluir uma alteração, validar desktop e celular, largura de 320px, nomes longos, foco e teclado, encerramento/perda de acesso, falha de conexão, menus após rolar e arraste quando aplicável. Registrar testes com API simulada como tal. Teclado virtual, gestos nativos e área segura exigem ensaio físico; não afirmar que emulação cobre esses comportamentos.

## Formulários em dispositivos de toque

Não abrir o teclado virtual nem selecionar opções automaticamente ao abrir um formulário. Manter rótulos, leitores de tela e navegação por Tab quando houver teclado conectado. O campo recebe foco por toque explícito; ações por teclado continuam podendo direcionar o foco ao primeiro campo.

Exceção ao ScrollArea do anfitrião: enquanto o cadastro de participante estiver aberto em dispositivo de toque, usar fluxo natural do documento, sem ancestral fixo envolvendo os campos. Header e dock permanecem fixos; ao sair do cadastro, as abas retomam a rolagem interna. Essa exceção reduz a exposição a deslocamentos de toque do WebKit após fechar o teclado. Emulação não substitui teste físico no Safari.

Ao concluir o cadastro assistido com sucesso, abrir a aba Fila, retirar o foco dos campos e restaurar a rolagem do painel no topo. A navegação de conclusão não deve ser rejeitada pelo bloqueio temporário de atualização dos dados. Falhas mantêm o formulário e o identificador da operação para reenvio.
