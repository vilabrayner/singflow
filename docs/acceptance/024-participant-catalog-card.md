# Participante: catálogo em card fixo — 13/11/2026

- Removido o botão de adicionar música em Pedidos. Inclusão pelo dock Catálogo; troca e cancelamento continuam em cada pedido.
- Card Catálogo sem título visual; região continua nomeada para leitores de tela.
- Altura acompanha a área disponível entre header/dock, incluindo redução por avisos. Abas começam no topo e ocupam toda a largura.
- Card com overflow hidden mantém seu contorno. A primeira aba tem raio superior esquerdo de 17px; a última tem raio superior direito de 17px, acompanhando o card de 18px com borda de 1px. Os cantos internos permanecem retos.
- Busca e orientação ficam fixas na área branca; resultados, Carregar mais e inclusão manual rolam apenas no ScrollArea da lista. O ScrollArea externo continua responsável por Pedidos/Histórico, sem rolar durante o catálogo.
- Troca entre abas preserva resultados e estado. Botão Carregar mais aumenta a lista, sem aumentar o card. Estados de Favoritas/Mais cantadas preservados.
- Testes de inclusão foram adaptados para usar o dock. Sem mudanças de backend ou migrations.

Validação: build aprovado; 38 cenários de participante passaram inicialmente. Os dois novos cenários de geometria passaram após corrigir o seletor do teste. Conferência visual identificou recuos sobrescritos por estilos encapsulados; especificidade refinada para manter padding de 12px na lista e orientação sem faixa cinza entre busca e texto. Após esse refinamento, os seis cenários relacionados passaram em desktop e celular, incluindo card fixo, estado entre abas e modal de troca. Conferência visual final aprovada.
