# Padronização visual do anfitrião

Autorizada após a validação da tela do participante. Escopo: anfitrião e estilos compartilhados, sem mudança das regras de fila ou do backend. Painel do músico será revisado separadamente.

## Entrega

- Fila sugerida em painéis com borda, quinas de 12 px e espaçamento consistente. Nome, música e artista continuam disponíveis; ações Chamar/Pular mantidas. A numeração usa fundo neutro. Sem alças de arraste para reordenar pessoas.
- Diretório de participantes em painéis com status à direita. Detalhes e retorno continuam dentro da modal. QR individual e ações do menu preservados.
- Músicas do participante e registros do palco usam os mesmos estilos base compartilhados dos pedidos/histórico do participante. Histórico mantém participante, música, artista e status; não exibe horários. Fica em card abaixo da fila, sempre aberto, sem modal, rolagem interna ou opção no menu.
- Adicionar música no detalhe abre catálogo compartilhado em modal ampla, com rodapé fixo e rolagem central. Botão primário +; pedidos pendentes/convocados têm fundo lilás e check sem botão. Entrada manual segue disponível, com salvamento no rodapé. Não se exibem abas pessoais no anfitrião: favoritas/mais cantadas dependem do futuro cadastro do participante.
- Primeiro pedido no cadastro assistido e definição de música na convocação mantêm autocomplete existente. Todos os vínculos e ações seguem a mesma API. Não há migration nem variável nova.

## Ensaio

1. Entrar como anfitrião, conferir a fila no celular e pesquisar por nome/música.
2. Abrir Participantes, conferir status, entrar nos detalhes e voltar à lista.
3. Adicionar música: selecionar catálogo, conferir novo pedido e reabrir; música já pendente deve ter check.
4. Usar Não encontrei minha música e enviar título/artista manualmente.
5. Convocar, concluir e conferir o histórico do palco em card abaixo da fila, com artista e tag à direita, sem horários.
6. Conferir pausa/retorno/saída, QR individual e menus por teclado. Usar sessões de ensaio.

Build frontend aprovado. Testes de navegador usam API simulada; o ensaio integrado continua a cargo do responsável. Serviços são iniciados e reiniciados pela IDE pelo responsável.

Verificação: 132 cenários de interface aprovados na padronização inicial com API simulada. Após mover o histórico para card, build aprovado e 16 cenários afetados aprovados em desktop/mobile, incluindo conclusão da apresentação, ausência, fila e adição de músicas. Nenhuma mudança de backend.
