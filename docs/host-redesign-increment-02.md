# Redesenho do anfitrião — incremento 02

Autorizado em 10/11/2026, após o responsável validar o início do painel. Implementação e verificações automatizadas concluídas; aceite manual deste incremento pendente.

## Entrega

- Inscrição assistida em cartão próprio: nome e primeira música visíveis; mesa e artista em informações opcionais. Botão “Criar participante” em toda a largura acima da fila. Cancelar retorna à operação sem enviar dados.
- Fila sugerida compacta, com nome, música, artista, apresentações e mesa. Busca por nome, mesa, música ou artista filtra a visualização, sem mudar a prioridade. Apenas a primeira sugestão real pode ser convocada, após confirmação.
- Convocação atual destacada, com conclusão como ação principal. Falta, recusa temporária e cancelamento por engano ficam em “Outras ações”, com explicação e confirmação. Oportunidade sem pedido continua exigindo música antes de concluir.
- Detalhes da pessoa acessíveis pelo nome na fila ou pelo cadastro: estado, chegada, origem, contagens, músicas e adição de novo pedido ao mesmo participante.
- “Participantes e pausas” reúne cadastros por chegada, busca por nome/mesa e filtros Todos, Participando e Fora da fila. Os filtros são administrativos, não uma classificação alternativa da fila.
- Pausa, retomada, reativação e saída possuem confirmação. Suspensão por falta continua obedecendo à rodada; a liberação manual só aparece no palco quando permitida pelo backend. Saída avisa sobre cancelamento dos pedidos e revogação do acesso pelo celular.
- Histórico do palco e estados de espera permanecem disponíveis. Sessão encerrada mantém consulta, com ações de alteração ocultas.
- Participantes ficaram organizados em `features/participants`, usando a mesma base visual de `shared`. O painel de sessões coordena os componentes de participantes e palco.
- Foco direcionado às confirmações e restaurado após navegação. Operações em andamento bloqueiam comandos concorrentes na interface; comandos do palco também aguardam o carregamento da sessão correta.

As regras de balanceamento, contagem, faltas e concorrência do backend não foram alteradas. Não há reordenação manual, exclusão de rascunho, confirmação de ida pelo participante ou novas integrações neste incremento.

## Verificação

- 36 testes de navegador passaram: 18 cenários em desktop e celular, com API simulada. Incluem regressão de login, sessão, inscrição, palco, compartilhamento e participante.
- Novos testes verificam que a busca não promove outra pessoa, convocação rejeitada não vira chamada confirmada, inscrição mantém dados/identificador após falha, e ações de pausa/retorno exigem confirmação.
- Os 4 testes de palco também passaram após acrescentar a captura da convocação.
- 5 testes de configuração, formatação e `git diff --check` passaram.
- Build de produção aprovado; pacote inicial de 540,25 kB, acima da meta de aviso de 500 kB, e avisos CommonJS do QR Code. Limites de build preservados.

As capturas foram conferidas visualmente em celular; fila, inscrição, detalhes e convocação também têm capturas desktop. Não equivalem a conformidade integral de acessibilidade nem a teste com o banco real. Backend, migrations, configuração de destinos e gerenciamento dos serviços não foram alterados.

## Aceite local

Com os serviços iniciados pelo responsável, em uma sessão de ensaio:

1. Inscrever duas pessoas; conferir o cartão de criação, opcionais e retorno à lista.
2. Buscar a segunda pessoa pelo nome/artista e conferir que ela não ganha o botão de convocação. Limpar a busca e convocar a primeira, após confirmar.
3. Conferir a apresentação destacada e registrar o resultado por confirmação. Testar falta ou recusa apenas com pessoas de ensaio.
4. Abrir uma pessoa pelo nome, adicionar música e conferir que permanece no mesmo cadastro.
5. Pausar, cancelar uma confirmação, retomar e consultar Fora da fila. Testar reativação de pessoa que saiu; chegada é nova, histórico permanece.
6. Conferir histórico, compartilhamento e consulta após encerramento. Repetir o essencial em celular e teclado.

## Capturas

- [Fila no celular](design/host/increment-02/fila-mobile.png) e [desktop](design/host/increment-02/fila-desktop.png).
- [Inscrição no celular](design/host/increment-02/inscricao-mobile.png) e [desktop](design/host/increment-02/inscricao-desktop.png).
- [Participante no celular](design/host/increment-02/participante-mobile.png) e [desktop](design/host/increment-02/participante-desktop.png).
- [Convocação no celular](design/host/increment-02/convocacao-mobile.png) e [desktop](design/host/increment-02/convocacao-desktop.png).
