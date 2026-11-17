# Catálogo administrativo com abas

Implementado em 15/11/2026, seguindo o catálogo do participante. Sem publicação ou alterações de API.

1. Abrir Admin → Catálogo. Conferir apenas duas abas: livro (Catálogo) e sincronização (Sincronizar), com acessibilidade por rótulo e teclado.
2. A busca fica fixa na faixa branca; filtros, atualização e cadastro continuam disponíveis. Conferir Todas por padrão, busca por título/artista, limpar pesquisa e filtros por situação.
3. Rolar apenas a lista cinza: card permanece entre header e dock, com sombras internas nas duas bordas sobre os itens e sem bloquear toques.
4. Abrir uma música, editar, aprovar/rejeitar, consultar auditoria e unificar duplicata pelos diálogos existentes. Paginação administrativa permanece preservada.
5. Entrar em Sincronizar. Conferir processamento existente, detalhes, pausa/retomada e aprovação. Retornar ao Catálogo deve preservar filtros e mostrar aviso quando houver revisão pendente.
6. Concluir as revisões: voltar à aba Catálogo com a notificação de sucesso existente.
7. Alternar o dock externo e retornar: consulta preservada, sem misturar abas administrativas com Favoritas/Mais cantadas.

Validação: build de produção aprovado. Regressão de catálogo/sincronização e catálogo do participante: 48 testes aprovados; navegação compartilhada: 4 aprovados. Teste visual específico em desktop/celular cobre busca fixa, rolagem, bordas, sombras, aviso de pendências, cadastro e largura de 320px. Testes usam API simulada; ensaio em aparelho físico pendente.
