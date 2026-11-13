# Migração aprovada de ícones

13/11/2026. Estado: aprovada e aplicada em 13/11/2026, com as quatro alterações indicadas pelo responsável. Inventário dos ícones explícitos do frontend, sem substituir automaticamente SVGs internos dos componentes PrimeNG. Font Awesome Free 7.3.1 instalado e verificado por metadados locais. Todos os ícones explícitos da aplicação foram migrados; a dependência direta e o CSS de PrimeIcons foram removidos. SVGs internos de componentes PrimeNG permanecem nativos.

| Uso | Atual | Sugestão |
|---|---|---|
| Mais cantadas | `pi-angle-double-up` | `fa-solid fa-ranking-star` |
| Voltar | `pi-arrow-left` | `fa-solid fa-arrow-left` |
| Avançar | `pi-arrow-right` | `fa-solid fa-arrow-right` |
| Trocar sessão/música | `pi-arrow-right-arrow-left` | `fa-solid fa-right-left` |
| Conhecer experiência | `pi-arrow-up-right` | `fa-solid fa-arrow-right` |
| Rejeitar/cancelada | `pi-ban` | `fa-solid fa-ban` |
| Abrir menu | `pi-bars` | `fa-solid fa-bars` |
| Catálogo | `pi-book` | `fa-solid fa-music` |
| Sessão/evento | `pi-calendar` | `fa-solid fa-calendar-days` |
| Confirmar/já adicionada | `pi-check` | `fa-solid fa-check` |
| Abrir detalhes | `pi-chevron-right` | `fa-solid fa-chevron-right` |
| Unificar duplicatas | `pi-clone` | `fa-solid fa-object-group` |
| Copiar link | `pi-copy` | `fa-solid fa-copy` |
| E-mail | `pi-envelope` | `fa-solid fa-envelope` |
| Erro/aviso | `pi-exclamation-circle` | `fa-solid fa-circle-exclamation` |
| Mostrar senha | `pi-eye` | `fa-solid fa-eye` |
| Ocultar senha | `pi-eye-slash` | `fa-solid fa-eye-slash` |
| Rascunhos | `pi-file-edit` | `fa-solid fa-file-pen` |
| Filtrar | `pi-filter` | `fa-solid fa-filter` |
| Arrastar/ordenar | `pi-grip-vertical` | `fa-solid fa-grip-vertical` |
| Músico | `pi-headphones` | `fa-solid fa-guitar` |
| Histórico | `pi-history` | `fa-solid fa-clock-rotate-left` |
| Fila/pedidos | `pi-list` | `fa-solid fa-list-ol` |
| Pedido bloqueado | `pi-lock` | `fa-solid fa-lock` |
| Chamar/cantar | `pi-microphone` | `fa-solid fa-bullhorn` |
| Pausar/agora não | `pi-pause` | `fa-solid fa-pause` |
| Editar música | `pi-pencil` | `fa-solid fa-pen` |
| Abrir/retomar | `pi-play` | `fa-solid fa-play` |
| Adicionar/criar | `pi-plus` | `fa-solid fa-plus` |
| QR Code | `pi-qrcode` | `fa-solid fa-qrcode` |
| Atualizar | `pi-refresh` | `fa-solid fa-rotate-right` |
| Buscar | `pi-search` | `fa-solid fa-magnifying-glass` |
| Administração | `pi-shield` | `fa-solid fa-shield-halved` |
| Sair | `pi-sign-out` | `fa-solid fa-right-from-bracket` |
| Destaque da página inicial | `pi-sparkles` | `fa-solid fa-wand-magic-sparkles` |
| Carregando | `pi-spinner` | `fa-solid fa-spinner fa-spin` |
| Favoritas | `pi-star` | `fa-regular fa-star` |
| Encerrar sessão | `pi-stop-circle` | `fa-solid fa-circle-stop` |
| Sincronizar catálogo | `pi-sync` | `fa-solid fa-rotate` |
| Fechar | `pi-times` | `fa-solid fa-xmark` |
| Excluir/cancelar pedido | `pi-trash` | `fa-solid fa-trash-can` |
| Cancelar convocação por engano | `pi-undo` | `fa-solid fa-rotate-left` |
| Conta/participação | `pi-user` | `fa-solid fa-user` |
| Criado pelo anfitrião | `pi-user-edit` | `fa-solid fa-user-pen` |
| Revogar acesso/registrar falta | `pi-user-minus` | `fa-solid fa-user-minus` |
| Criar/reativar participante | `pi-user-plus` | `fa-solid fa-user-plus` |
| Participantes/cadastros | `pi-users` | `fa-solid fa-users` |

Unificar duplicatas usa object-group para indicar união; a seta diagonal da página inicial aponta para páginas internas, por isso arrow-right. Favoritas usa estrela regular; preenchimento sólido pode representar favorita selecionada no futuro. Carregamento inclui fa-spin. Os ícones próprios da marca e QR Codes gerados são imagens/identidade, não parte desta migração.

Implementação e validação: [registro da migração](../acceptance/023-fontawesome-migration.md).
