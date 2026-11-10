# Aceite 002 — fila sugerida e operação do palco

Estado: aceito pelo responsável após teste manual com serviços independentes e Docker.

## Evidências e alcance

O responsável informou “Roteiro testado com sucesso” e confirmou execução nos dois modos, incluindo reinício com convocação ativa e espera após primeira falta. O roteiro de referência é [Ensaio de fila e palco](../stage-testing.md).

Foram validados no roteiro relatado: sugestões com e sem pedidos, aprovação de convocação, conclusão e contagens, recusa/pausa, faltas e rodada de espera, inativação, reativação, cancelamento por engano, saída durante convocação, bloqueio de encerramento com convocação ativa e persistência após reinício.

Verificações automatizadas da entrega: 24 testes backend sem falhas, incluindo PostgreSQL e concorrência; 12 testes de interface desktop/celular com API simulada; cinco testes de configuração frontend; compilações e imagens Docker concluídas. O responsável iniciou a verificação completa do backend na IDE e informou `BUILD SUCCESS`.

O aceite manual é informado pelo responsável e não representa nova execução automatizada de cada passo pelo agente. Não houve publicação nem teste de carga. Os serviços permaneceram sob gestão do responsável.

## Limites

A migração V3 preserva os dados anteriores e inclui os estados e registros do palco. Este aceite não inclui check-in autônomo, QR Code, pedidos feitos pelo participante, catálogo híbrido completo, painel exclusivo do músico, WebSocket, PWA ou hospedagem.

## Continuação

A [revisão de check-in pelo celular](../participant-review.md) está preparada para discussão. Este aceite não autoriza sua implementação.
