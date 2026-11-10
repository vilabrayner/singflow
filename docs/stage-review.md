# Revisão do próximo incremento — fila sugerida e palco

Estado: regras e recorte aprovados e implementação autorizada pelo responsável. Implementação concluída e aceite manual confirmado nos dois modos; ver [Aceite 002](acceptance/002-stage-flow.md). Testes e roteiro em [Ensaio de fila e palco](stage-testing.md).

Base: [ADR 004](decisions/004-participation-and-repeat-suggestions.md) e [aceite do fluxo assistido](acceptance/001-assisted-flow.md). Este incremento reúne o motor mínimo de sugestões e os resultados do palco para permitir testar a justiça ao longo de várias rodadas.

## Regras já aprovadas

- Prioridade por menos apresentações concluídas na sessão, depois existência de pedido elegível e depois check-in.
- Sugestão sem pedido exibe “música a escolher”, sem criar pedido fictício.
- Anfitrião confirma antes da convocação. Sugestão é recalculável; convocação confirmada é persistida.
- Múltiplos pedidos não dão múltiplas oportunidades na mesma rodada.
- Só conclusão incrementa apresentações, uma vez, e zera faltas.
- Recusa pausa sem falta; primeira falta suspende temporariamente; segunda falta consecutiva inativa.
- Falta é confirmada pelo anfitrião, não pelo relógio.
- Saída cancela pedidos pendentes; inativação por ausência suspende pedidos. Histórico permanece.

## Recorte aprovado

No painel do anfitrião: lista sugerida, justificativa, confirmação de convocação, música efetivamente escolhida, conclusão, falta, recusa/pausa, cancelamento de convocação por engano e reativação. Persistir histórico e auditoria com proteção contra concorrência.

Manter cadastro assistido e músicas em texto livre. Catálogo híbrido, check-in autônomo, painel exclusivo do músico, WebSocket e PWA seguem fora deste incremento proposto. Atualização manual por botão basta para o primeiro ensaio; atualização periódica pode ser revista depois.

## Decisões aprovadas

| Tema | Decisão |
| --- | --- |
| Convocações simultâneas | Uma convocação em andamento por sessão; resolver a atual antes de confirmar outra |
| Ordem dos pedidos | Escolher o pedido pendente mais antigo da pessoa; desempatar por identificador |
| Exibição da sugestão | Uma posição por pessoa elegível, com sua próxima música ou “música a escolher”; recalcular após cada alteração |
| Repetição imediata | Dentro de um empate em apresentações, preferir outras pessoas elegíveis à que acabou de concluir, antes de comparar pedido/check-in; nunca superar alguém com menos apresentações por esse motivo |
| Recusa | Pausar até retomada manual pelo anfitrião, sem registrar falta nem zerar faltas anteriores |
| Retorno de pausa | Preservar ordem de chegada, apresentações e pedidos; pausa não é novo check-in |
| Reativação após duas faltas | Confirmação do anfitrião, nova ordem de chegada, apresentações preservadas, faltas zeradas e pedidos suspensos voltam a pendentes |
| Retorno após saída | Anfitrião seleciona o cadastro conhecido; nova ordem de chegada, apresentações preservadas; pedidos já cancelados não são reativados |
| Música a escolher | Convocação pode iniciar sem música; exigir título antes de concluir; guardar a escolha no histórico da apresentação, sem inventar pedido |
| Cancelamento por engano | Cancela somente a convocação, devolve pedido reservado a pendente e não conta apresentação, falta nem oportunidade para a rodada |

A proteção contra repetição imediata acima detalha uma exceção ao desempate previamente registrado; foi aprovada explicitamente pelo responsável. Exemplo: Ana acabou de concluir e agora empata em contagem com Bruno. Mesmo que só Ana tenha pedido, a regra dá a próxima oportunidade a Bruno. Se Ana ainda tiver menos apresentações, a prioridade principal continua sendo dela. Sem outra pessoa elegível, pode haver repetição imediata.

Não propor limite numérico de pedidos silenciosamente: o anfitrião já coleta pedidos e as posições são por pessoa. Limite de pedidos pode ser definido separadamente se necessário.

## Primeira falta: rodada determinística aprovada

Ao registrar primeira falta:

1. Suspender a pessoa e registrar o conjunto dos demais participantes elegíveis naquele instante.
2. Cada um desse conjunto deve receber uma oportunidade confirmada e resolvida por conclusão, falta ou recusa; apenas aparecer na sugestão não conta.
3. Quem sair, pausar ou ficar inativo deixa de bloquear a rodada. Novas inscrições não ampliam o conjunto já registrado.
4. Ao esgotar esse conjunto, a pessoa suspensa volta a ficar elegível, sem convocação automática.
5. Se o conjunto já nascer vazio, o anfitrião libera manualmente uma segunda tentativa, preservando a primeira falta. Não liberar automaticamente para evitar duas chamadas imediatas.

A segunda falta consecutiva é por pessoa na sessão, independentemente do pedido, e inativa a participação. Conclusão zera a sequência. Pausa, recusa e cancelamento por engano não a zeram.

Esse mecanismo detalha a espera de uma rodada e foi aprovado na revisão; implementado neste incremento.

## Pedidos e resultados aprovados

| Evento | Pedido vinculado |
| --- | --- |
| Confirmação de convocação | Reserva o pedido; ele deixa de ser elegível para outra convocação |
| Conclusão | Marca como atendido |
| Primeira falta | Devolve a pendente; participante permanece suspenso até cumprir a regra da rodada |
| Segunda falta | Suspende pedidos da pessoa |
| Recusa | Devolve a pendente; pessoa permanece pausada |
| Saída voluntária | Cancela pedidos ainda não atendidos e registra desistência na convocação, sem apagar histórico |
| Cancelamento por engano | Devolve a pendente, sem punição |

Uma convocação sem pedido usa o mesmo ciclo, apenas sem transição de pedido. Registrar uma nova música pela tela de pedidos durante uma convocação sem pedido não deve vinculá-la ou consumi-la silenciosamente.

## Encerramento e consistência

Decisão: impedir encerramento da sessão enquanto existir convocação em andamento, orientando a concluir ou cancelar primeiro. Após encerramento, histórico continua legível e comandos de palco ficam bloqueados.

Sugestões recebidas pela interface podem ficar desatualizadas. Na confirmação, o servidor verifica novamente sessão, participante, pedido e estado da convocação. Conflitos retornam mensagem para atualizar, sem selecionar outra pessoa silenciosamente. Usar operação idempotente e transação por sessão para não duplicar convocação, contagem ou falta. Auditoria faz parte da mesma transação.

Novas tabelas/estados entram em migração posterior a V2; migrations já aplicadas não serão reescritas. Preservar os dados do ensaio existente. O desenho dos contratos entre `stage`, `participants`, `requests`, `sessions` e `audit` será verificado pelo Modulith.

## Critérios de aceite

- Três participantes empatados, com pedidos: seguir check-in e consumir um pedido por oportunidade.
- Menos apresentações vence mesmo sem pedido; pedidos só desempatem conforme regra aprovada.
- Todos sem pedidos: continuar sugerindo pessoas, sem criar solicitações.
- Muitos pedidos de uma pessoa não monopolizam o palco.
- Confirmar por duas abas simultaneamente produz uma única convocação ativa.
- Repetir conclusão ou falta não duplica efeitos.
- Recusa e ausência têm efeitos distintos.
- Rodada de ausência funciona com participantes que entram, saem ou pausam durante a espera.
- Duas faltas inativam; reativação segue a política aprovada.
- Cancelamento por engano não penaliza a pessoa.
- Saída durante convocação preserva histórico e resolve vínculos.
- Reinício preserva convocação, apresentações, sequência de faltas e espera de rodada.
- Replicar o ensaio com serviços independentes e Docker, iniciados pelo responsável na IDE.

## Autorização

O responsável aprovou esta revisão, incluindo o desempate contra repetição imediata. A implementação foi autorizada em seguida e executada, sem ampliar o aceite anterior. O aceite anterior permanece restrito ao fluxo assistido já entregue.
