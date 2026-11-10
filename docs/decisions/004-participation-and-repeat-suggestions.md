# ADR 004 — Participação, ausências e sugestões de repetição

Estado: regras de negócio aprovadas; fluxo assistido básico aceito, fila e palco implementados e aceitos nos dois modos.

## Contexto

Apenas ordenar pedidos não atende a sessões com poucos participantes. O anfitrião precisa receber sugestões de novas oportunidades mesmo quando não há músicas solicitadas. Também é necessário tratar quem sai voluntariamente, recusa uma oportunidade ou deixa o local sem encerrar sua participação.

A prioridade é por pessoa na sessão. Mesa pode identificar a pessoa, mas não constitui unidade de rodízio nesta regra.

## Inscrição assistida pelo anfitrião

Estado: inscrição, novos pedidos, busca e saída assistidos implementados e aceitos; sugestões, pausa e retorno implementados e aceitos no fluxo assistido.

A sessão aceita entrada pelo próprio participante e entrada assistida pelo anfitrião. Ambas alimentam a mesma fila e seguem as mesmas regras. A origem do cadastro não muda prioridade nem cria uma fila separada.

No fluxo assistido, o anfitrião coleta nome, primeira música e, opcionalmente, mesa. O participante não precisa usar celular, QR Code nem criar conta. A escolha musical é registrada como pedido real feito pelo anfitrião em nome da pessoa, e não como pedido automático do motor.

O cadastro assistido representa uma pessoa, vinculada à sessão, sem substituir a identidade autenticada do anfitrião. Pedidos seguintes são adicionados ao mesmo cadastro: não geram novo check-in, não alteram a ordem de chegada e não zeram apresentações ou faltas. A ordem inicial é atribuída pelo servidor no momento da inscrição, sem retroagir automaticamente à chegada física ao estabelecimento.

Antes de cadastrar, a tela permite procurar participantes existentes para reduzir duplicidades. Nomes iguais ou mesa compartilhada não permitem mesclar identidades automaticamente.

O anfitrião é responsável por coletar novas escolhas musicais dessa pessoa e registrá-las. Quando não houver pedido, o app continua sugerindo a oportunidade com “música a escolher”; o anfitrião obtém a escolha e a vincula à convocação conforme o fluxo do palco. Essa sugestão, sozinha, não cria pedido nem aumenta apresentações.

O anfitrião também pode registrar pausa, saída e retorno em nome do participante, aplicando as mesmas regras de histórico, faltas e reativação. Na inscrição assistida, a saída encerra a participação selecionada; não encerra a sessão autenticada do anfitrião. A auditoria identifica ator, participante, sessão e origem assistida para cadastro e pedidos.

A operação assistida é fluxo principal: deve ser possível conduzir o evento mesmo que nenhum participante use QR Code. A transferência posterior do cadastro para o celular do participante fica fora do MVP; não criar automaticamente uma identidade por dispositivo do anfitrião para cada inscrição.

Critérios de aceite:

- Anfitrião autorizado inscreve pessoa com nome e primeira música sem celular do participante.
- Nova música usa o cadastro existente e preserva check-in e contagens.
- Participantes assistidos e autônomos recebem a mesma política de prioridade.
- Sem pedidos, uma oportunidade pode ser sugerida e aprovada para a pessoa assistida.
- Pausa, saída e retorno não apagam histórico nem desconectam o anfitrião.
- Cadastro e pedidos identificam o anfitrião responsável na auditoria.
- A sessão pode operar inteiramente por inscrição assistida.

## Sugestões e convocações

Existem dois tipos de sugestão:

- Com pedido elegível: participante e música solicitada.
- Sem pedido: participante e indicação “música a escolher”.

A sugestão sem pedido não cria uma solicitação em nome do participante. O anfitrião aprova antes de confirmar a convocação; a música pode ser definida posteriormente. Sugestões são recalculáveis, convocações confirmadas são registros persistidos. Somente a conclusão de uma apresentação aumenta a contagem, uma única vez.

O check-in deve informar que participantes ativos podem receber novas oportunidades mesmo sem pedidos. A interface do anfitrião deve mostrar o motivo da sugestão.

## Critérios de seleção

Considerar participantes ativos e elegíveis, excluindo os temporariamente suspensos/pausados, os inativos e quem já possui convocação em andamento.

Ordenar por:

1. Menor número de apresentações concluídas naquela sessão.
2. Entre pessoas empatadas nessa contagem, preferir quem não acabou de concluir, evitando repetição imediata.
3. Persistindo empate, existência de pedido elegível, antes de repetição sem pedido.
4. Persistindo o empate, ordem de check-in.

O desempate contra repetição imediata foi aprovado na revisão de fila e palco. Ele nunca supera a prioridade por menos apresentações. Não impor espera artificial quando houver apenas uma pessoa elegível.

Múltiplos pedidos não dão direito a várias chamadas na mesma rodada. A projeção deve balancear por pessoa e considerar posições já projetadas e convocações confirmadas para não reservar oportunidades duplicadas. O cálculo técnico dessas reservas será especificado antes da implementação.

Exemplos:

| Situação | Resultado |
| --- | --- |
| Ana, Bruno e Carla têm uma apresentação; apenas Ana tem pedido | Ana com música; depois Bruno e Carla com “música a escolher”, respeitando check-in entre eles |
| Ana tem duas apresentações e nenhum pedido; Bruno tem três e um pedido | Ana tem prioridade pela menor contagem |
| Todos empatados e sem pedidos | Sugerir nova rodada pela ordem de check-in |
| Apenas Ana está elegível | Pode sugerir Ana novamente, informando que não há outra pessoa elegível |

A aprovação e a conclusão de cada oportunidade atualizam o estado oficial antes do próximo recálculo. Uma projeção longa não representa convocações já confirmadas.

## Saída voluntária

“Sair da sessão” encerra a participação no servidor e limpa o vínculo daquela participação no navegador, preservando o histórico. A ação deve funcionar independentemente de já existir pedido.

Quando o módulo de solicitações existir, a saída cancela os pedidos pendentes e retira a pessoa da fila sugerida. Cancelar um pedido isolado não encerra a participação. Se houver convocação confirmada, registrar a desistência e sinalizar ao anfitrião e ao músico, preservando o registro.

## Recusa e não comparecimento

Recusar com “agora não quero cantar” pausa temporariamente as sugestões, sem registrar falta. A retomada é manual pelo anfitrião, preservando posição de chegada, apresentações, pedidos e faltas anteriores.

Não comparecimento depende de confirmação do anfitrião. Tempo decorrido pode orientar a operação, mas não confirma ausência automaticamente.

| Evento | Efeito |
| --- | --- |
| Primeira falta | Suspensão temporária da fila sugerida |
| Após uma rodada | Volta a ficar elegível para uma nova oportunidade, sem convocação automática |
| Segunda falta consecutiva | Inativação automática por ausência e retirada da fila sugerida |
| Apresentação concluída | Zera a sequência de faltas |

Uma rodada oferece oportunidade aos demais participantes elegíveis antes de tentar novamente. Se não houver outros, o anfitrião decide quando repetir a chamada. O conjunto de espera é fixado na primeira falta; novas entradas não o ampliam, e quem sai ou pausa deixa de bloquear. Detalhes aprovados na revisão de fila e palco.

A sequência de faltas é por participante na sessão, não por pedido. Falta não conta como apresentação concluída. Na inativação, os pedidos pendentes ficam suspensos, preservando o histórico; isso é diferente do cancelamento por saída voluntária. A convocação recebe resultado “não compareceu”.

## Retorno

Após inativação por ausência, a pessoa pode solicitar reativação, com confirmação do anfitrião. Recebe nova posição de chegada, mantendo apresentações concluídas. A revisão aprovada define faltas zeradas e pedidos suspensos devolvidos a pendentes na reativação.

Após saída voluntária, nova entrada recebe nova posição de check-in e deve preservar apresentações concluídas quando for possível reconhecer a mesma pessoa. Sem conta e após limpar a identidade local, esse reconhecimento não é garantido. Não usar apenas nome ou mesa para reunir identidades automaticamente.

## Auditoria, concorrência e verificação

Registrar saída, recusa/pausa, faltas, inativação, reativação, aprovação de convocação e conclusão, com ator, instante, sessão e motivo quando aplicável. Transações e retentativas não podem duplicar faltas, apresentações ou convocações. A saída não deve apagar histórico de auditoria.

Critérios de aceite para os incrementos correspondentes:

- Sugestão sem pedido existe e não cria pedido fictício.
- Pedido tem preferência somente no empate de apresentações; empate restante respeita check-in.
- Vários pedidos da mesma pessoa não monopolizam a rodada.
- Ausência e recusa produzem efeitos diferentes.
- Duas faltas consecutivas confirmadas pelo anfitrião inativam a participação.
- Conclusão zera faltas e incrementa apresentações uma única vez.
- Pessoa que saiu ou foi suspensa não recebe novas sugestões indevidas.
- Confirmações e saídas concorrentes não deixam convocações ou contagens inconsistentes.

## Consequências e limites

O motor sugere participantes e pedidos, em vez de depender exclusivamente de pedidos enfileirados. Ter poucos participantes não exige que o anfitrião memorize repetições. Confirmar a oportunidade continua sendo uma decisão do anfitrião.

Estas decisões documentam o comportamento desejado e não autorizam iniciar implementação. Limites de pedidos, escolha entre pedidos da mesma pessoa, reativação, pausas, reservas e detalhes de rodada serão revisados antes dos respectivos incrementos.

## Evolução e aceite

O [Aceite 001](../acceptance/001-assisted-flow.md) cobre somente o primeiro fluxo assistido. O detalhamento de rodadas, pausas, reservas, reativação e concorrência foi aprovado em [Revisão de fila e palco](../stage-review.md), incluindo o desempate contra repetição imediata. A implementação foi autorizada e concluída; o aceite manual foi confirmado nos dois modos em [Aceite 002](../acceptance/002-stage-flow.md). Veja [Ensaio de fila e palco](../stage-testing.md).
