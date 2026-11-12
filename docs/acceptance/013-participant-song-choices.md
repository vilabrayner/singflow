# Escolhas musicais do participante — 12/11/2026

## Entrega

O painel preserva posição sugerida, aviso de próximo, convocação e retorno à fila após conclusão pelo anfitrião. Exibe a próxima música, pedidos ativos e histórico recolhido.

Adicionar música abre o catálogo aprovado, paginado em 20 registros. A busca oferece primeiro SingFlow e complementa com Last.fm, a partir de 3 caracteres, após 400 ms, com até 10 resultados. É possível adicionar várias músicas sem fechar a janela. Se não encontrar, o participante informa título e artista opcional manualmente.

A escolha de um resultado Last.fm recebe um comprovante opaco emitido pelo backend, válido por 30 minutos. No envio, o backend confere título e artista antes de aprovar o cadastro e registra auditoria. Resultado alterado ou comprovante vencido exige nova seleção. Texto livre continua provisório; pesquisar não aprova músicas. A política também vale para seleções nos formulários compartilhados do anfitrião e de entrada/retorno do participante. Cadastro rejeitado não é reativado automaticamente por seleção externa.

Setas sob cada música pendente permitem subir/descer as escolhas pessoais. A música reservada para convocação não pode ser movida. Isso não altera chegada, apresentações concluídas nem prioridade entre participantes. Atualizações concorrentes são rejeitadas e a tela consulta a ordem atual antes de outra tentativa. Reenvios da mesma operação não repetem a auditoria.

## Execução

Sem novas variáveis. Manter LASTFM_API_KEY somente no backend. Ao reiniciar o backend pela IDE, Flyway aplica V16, que preserva a ordem anterior dos pedidos e cria o armazenamento de comprovantes e operações de reordenação. Não editar migrations anteriores nem executar repair. Reiniciar/publicar o frontend para carregar a nova interface.

## Ensaio integrado

1. No participante, abrir Adicionar música: selecionar uma música local e continuar escolhendo.
2. Buscar no Last.fm, escolher um resultado e conferir no admin que entrou aprovado.
3. Usar Não encontrei minha música e enviar texto livre: deve entrar provisório.
4. Com músicas A e B pendentes, subir B: a próxima música muda para B; a posição da pessoa permanece igual.
5. Convocar B pelo anfitrião: B não apresenta setas. Concluir normalmente e conferir o retorno à fila e histórico.
6. Em duas abas, tentar reordenar a mesma lista: a segunda operação deve atualizar os dados sem sobrescrever a primeira.
7. Conferir o fluxo em celular e por teclado, inclusive fechamento da janela e consulta do histórico.

## Validação

Build frontend aprovado. Backend: 38 testes sem banco aprovados; responsável informou BUILD SUCCESS no verify completo, incluindo V16, aprovação Last.fm validada, concorrência, reenvio e proteção da música convocada. 126 cenários de interface aprovados em desktop/mobile com API simulada (124 na regressão e os 2 restantes após tornar exata a busca do título no teste). Build mantém os avisos existentes de tamanho inicial e dependências CommonJS. Testes de navegador usam API simulada; o ensaio integrado acima continua a cargo do responsável.

## Redesenho em três cards

Status, pedidos musicais e histórico foram separados em componentes da feature. A página mantém os dados e operações; os componentes recebem dados e emitem ações. O retorno à fila permanece dentro do status. Removido o resumo avulso da próxima música, preservando apenas três cards.

Pedidos pendentes usam painéis com borda, alça pi-grip-vertical, ordem, título, artista, situação e ícones pi-caret-down, pi-caret-up e pi-trash. Em celular, os três controles de 44 px ficam em coluna à direita. Arrastar usa Angular CDK já instalado; o envio usa a mesma operação de reordenação do backend e rejeita alterações concorrentes. A alça é a única área de arraste, preservando a rolagem no restante do painel; setas permitem operação por teclado. Pedidos reservados não podem ser movidos ou cancelados.

Validação do redesenho: 28 cenários de interface aprovados em desktop e celular com API simulada, incluindo três cards, títulos longos sem transbordamento, arraste, setas, conflito de convocação, confirmação/cancelamento, retorno, acesso individual e restauração. Build aprovado; nenhuma alteração adicional no backend ou migration. Conferir o gesto de toque no aparelho durante o ensaio local.

### Troca da música de um pedido

Retirados os botões de caret; lápis abre a escolha pelo catálogo/Last.fm ou texto livre, lixeira mantém a confirmação de cancelamento. A troca conserva UUID, chegada e ordem do pedido. A alça mantém arraste e teclas de seta como alternativa acessível. O backend exige participante ativo, pedido próprio e pendente, confere o conteúdo original para rejeitar edição obsoleta e audita SELF_REQUEST_EDITED. Pedido reservado não admite troca. A mesma seleção Last.fm validada continua aprovada automaticamente. Sem migration nova. Responsável informou BUILD SUCCESS no verify completo com o cenário de edição, reenvio, ordem preservada e bloqueio de pedido alheio/convocado.

### Abas do seletor de músicas

Modais Adicionar/Trocar compartilham o componente SongChoiceTabs: Músicas favoritas, Mais cantadas e Catálogo. Catálogo abre por padrão, oferece busca local/Last.fm e entrada manual dentro da mesma aba, preservando a pesquisa ao alternar abas. Favoritas e Mais cantadas apresentam filtros desabilitados e explicam que dependem do futuro cadastro de participantes. Não criam preferências locais nem calculam rankings provisórios. O catálogo continua aprovado, alfabético e paginado. Não há alteração no backend ou migration. Build aprovado e 32 cenários do participante aprovados com API simulada em desktop/mobile, incluindo navegação por teclado, preservação da busca e formulário manual.

### Seletor em tela cheia

Adicionar/Trocar música usa modo optativo de tela cheia do diálogo compartilhado. Título, abas e rodapé permanecem fixos; apenas os painéis das abas têm rolagem. Cancelar fica sempre no rodapé; o formulário manual usa a ação de envio no mesmo rodapé, vinculada ao formulário. Layout usa altura dinâmica do viewport e áreas seguras do aparelho. Outras modais preservam o modo habitual. Build aprovado; teste de lista longa confere dimensões de tela cheia e posições constantes de abas/rodapé durante a rolagem em desktop/mobile.

### Botão compacto e indicação de pedido existente

Resultados do seletor usam botão primário de 48 px com apenas pi-plus e nome acessível. Quando título e artista correspondem a um pedido PENDING ou RESERVED da própria participação, o resultado mostra o círculo com check (pi-check-circle na versão instalada do PrimeIcons), rótulo acessível Já adicionada e fica desabilitado. Comparação ignora caixa e espaços repetidos, preservando artistas distintos. Dados vêm do estado atual do participante; após salvar, a lista atualiza a indicação sem fechar o seletor. Pedidos concluídos ou cancelados não bloqueiam nova escolha. Proteção visual do seletor, sem nova regra global de unicidade no backend nem migration.
