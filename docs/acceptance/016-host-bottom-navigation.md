# Navegação inferior do anfitrião — 12/11/2026

Implementação autorizada após aprovação do esboço. Este incremento altera somente o frontend do anfitrião; participante e músico serão tratados separadamente.

## Comportamento

- Barra inferior fixa com ícones e legendas Fila, Participantes e Histórico, baseada em PrimeNG Tabs. Item ativo em lilás/roxo. Respeita área segura do aparelho e reserva espaço no conteúdo para não cobrir o último item.
- Logo/header e card da sessão permanecem comuns. Fila abre por padrão em uma nova sessão selecionada. A barra não aparece no login, na criação de sessão ou em rascunho; desaparece após logout/remoção da sessão selecionada.
- Fila mantém convocação de qualquer elegível, confirmação fora da vez, arraste, ordem manual persistente, pausa/retomada e QR Code. Não contém Criar participante.
- Participantes apresenta diretório na própria tela, busca, filtros e Criar participante. O formulário assistido fica restrito à aba. Ao trocar de aba, os valores ainda não enviados são preservados. Detalhes, músicas e QR individual continuam em modal; Voltar à lista fecha os detalhes e ativa Participantes.
- Histórico exibe apenas os itens do palco, com componente compartilhado do participante, status à direita e sem horários. Estado vazio e falha de carregamento possuem retorno visual na própria seção.
- Estado de fila e atualizações periódicas continuam vivos durante as trocas, sem recriar a fila. As operações não mudam a aba selecionada. Selecionar outra sessão volta para Fila. Sessões encerradas continuam consultáveis e não oferecem criação de participante.
- Teclado: PrimeNG mantém seleção/foco das abas por setas e Enter; botões de ação ficam bloqueados durante operações. Modais e menus continuam acima da navegação.

## Ensaio integrado

1. Abrir sessão: conferir Fila selecionada e QR no estado vazio, sem botão Criar participante.
2. Abrir Participantes, criar pessoa com música, conferir diretório sem modal e os dados na Fila.
3. Preencher cadastro sem enviar, alternar para Histórico e retornar: os campos devem continuar preenchidos.
4. Abrir detalhes pela fila ou diretório; Voltar à lista deve levar a Participantes. Conferir QR e adição de música.
5. Reordenar a fila, trocar de aba e voltar; convocar, pausar/retomar e concluir. Abrir Histórico e conferir o resultado sem horário.
6. No celular e em 320 px, rolar até o fim da lista e conferir que a barra não cobre o último item. Testar navegação por teclado e menus com fundo escurecido.
7. Selecionar sessão encerrada: consultar pessoas/histórico sem poder cadastrar. Sair da conta: barra inferior deve desaparecer.

Nenhuma migration, nova variável ou alteração de backend. Serviços continuam sob controle do responsável pela IDE. Build frontend aprovado, com os avisos preexistentes de orçamento inicial e dependências CommonJS. Testes de interface usam API simulada; ensaio local integrado fica com o responsável.

## Resultado da verificação

140 cenários cobertos em desktop/mobile com API simulada: 136 passaram na regressão ampla e quatro expiraram durante animações/atualização periódica; os quatro passaram na repetição direcionada de dez cenários. As novas verificações cobrem uma única aba ativa, cor de seleção, preservação da instância da fila e do rascunho do formulário, lista sem modal, retorno dos detalhes, último item acima da barra em 320 px, teclado, sessões vazias/encerradas, logout e erro de histórico. Os testes de arraste agora posicionam a alça no centro da área visível, acima da barra fixa; o teste de atualização do músico explicita que a página está em primeiro plano. Revisão visual de capturas mobile concluída.
