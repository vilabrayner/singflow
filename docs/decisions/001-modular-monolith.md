# ADR 001 — Monólito modular e organização por funcionalidade

Estado: fundação implementada com Spring Boot 4.1.2 e Modulith 2.1.2; módulos de negócio pendentes.

## Contexto

O SingFlow combina regras transacionais de fila e palco com catálogo, solicitações e três experiências de uso. O repositório já possui um backend Java 21/Spring Boot.

## Decisão

Manter uma aplicação backend e PostgreSQL, usando Spring Modulith para limites por domínio. Organizar módulos diretamente sob `br.tec.flowave.singflow`, com `endpoints/` dentro de cada funcionalidade. Preservar `backend/` e `frontend/` na raiz do monorepo.

Manter Java 21 e avaliar a compatibilidade do Spring Boot 4.1.2 existente com a versão escolhida do Modulith e demais dependências antes de fixá-las. REST e WebSocket/STOMP são os canais previstos.

## Consequências

Transações locais simplificam consistência de fila, apresentações e auditoria. Limites entre módulos precisam de contratos e verificações automatizadas. A publicação inicial será conjunta. Microsserviços, broker externo e múltiplas instâncias não fazem parte da fundação.
