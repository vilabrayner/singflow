# Aceite 001 — primeiro fluxo assistido

Estado: aceito pelo responsável após testes locais. Registro em 09/11/2026 (America/Recife).

## Evidências

- Responsável informou `BUILD SUCCESS` na verificação backend com PostgreSQL temporário via Testcontainers.
- Responsável executou o roteiro completo com backend e frontend independentes.
- Após reiniciar o backend, confirmou sessão aberta, participantes, pedidos e saída preservados; captura apresentada na conversa mostrou Ana com dois pedidos, Carlos com um e Roberto como saiu com pedido cancelado.
- Responsável informou conclusão bem-sucedida do roteiro via Docker, após instruções incluindo reinício do backend e conferência de persistência.
- Verificações do agente: compilações Java/Angular, limites Modulith, testes locais de configuração, oito testes de interface com API simulada e construção das imagens Docker.

O aceite funcional manual é informado pelo responsável; não representa observação automatizada de cada ação no banco. O agente não iniciou os serviços para esse aceite. Não há publicação, teste de carga ou validação de produção neste registro.

## Escopo aceito

Acesso provisionado do anfitrião; criar, abrir e encerrar sessões; inscrição assistida com nome, mesa opcional e primeira música; busca; novos pedidos no mesmo cadastro; lista por chegada; saída com cancelamento de pedidos pendentes e preservação do histórico. Persistência validada após reinício nos testes relatados.

A configuração local foi ajustada para permitir execução pela IDE com `SingflowApplicationLocal` e leitura do `.env`. Docker continua usando variáveis fornecidas pelo Compose e configuração pública do frontend montada em execução.

## Fora deste aceite

Motor de sugestões, convocações, apresentações concluídas, faltas, pausa, reativação, check-in autônomo, catálogo híbrido completo, painel do músico, PWA e hospedagem. A auditoria está implementada e coberta pelo teste backend; não foi informado um exame manual independente de todos os registros.

## Continuação

Próxima revisão: [Fila sugerida e operação do palco](../stage-review.md). O aceite desta entrega não autoriza implementação da próxima.
