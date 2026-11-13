# Ações dos pedidos do participante

- Pedido pendente mostra SpeedDial e botão de excluir separado.
- SpeedDial reaproveita máscara, rótulos, direção automática e teclado do componente compartilhado. Trocar está habilitado; Configurar está visivelmente desabilitado.
- Trocar abre Catálogo, sem modal. Exibir pedido de destino e Cancelar troca. Botões da lista usam fa-right-left; adição normal usa fa-plus.
- Escolher música substitui o mesmo pedido mantendo ordem e validação de concorrência; sucesso volta a Pedidos.
- Texto livre continua permitido. Falha mantém modo de troca e dados para revisão.
- Cancelar troca ou navegar para Pedidos/Histórico remove o modo; voltar ao Catálogo permite adicionar normalmente.
- Convocação, perda de participação ou encerramento removem a troca pendente.
- Não alterar API, migrations, permissões, ordem da fila ou pedidos já convocados.

Testes usam dados simulados em desktop/celular e WebKit móvel. O teclado e gestos nativos continuam exigindo conferência física.

Validação: build de produção concluído. Regressão com 178 cenários aprovados e dois ignorados por plataforma; duas expectativas antigas do cadastro do anfitrião foram alinhadas ao retorno para Fila já validado e passaram na repetição de oito testes relacionados. Três cenários de troca, texto livre e cancelamento passaram também no WebKit móvel com eventos de toque.
