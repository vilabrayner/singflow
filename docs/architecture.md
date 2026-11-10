# Arquitetura do SingFlow

## Objetivo e estado

Este documento descreve a arquitetura alvo. Não implica que os módulos ou fluxos já estejam implementados. A estrutura existente `backend/` e `frontend/`, assim como o pacote Java `br.tec.flowave.singflow`, será preservada.

## Backend por funcionalidade

Uma aplicação Spring Boot, modularizada com Spring Modulith, com módulos diretamente abaixo do pacote principal:

```text
br.tec.flowave.singflow/
├── SingflowApplication.java
├── identity/
├── sessions/
│   ├── endpoints/
│   ├── application/
│   ├── domain/
│   └── infrastructure/
├── participants/
├── catalog/
├── requests/
├── stage/
└── audit/
```

Os subpacotes serão criados conforme a necessidade. Não haverá um pacote global de controllers nem uma camada genérica de serviços reunindo todas as funcionalidades.

| Módulo | Responsabilidade |
| --- | --- |
| identity | Identidades, autenticação e permissões por sessão |
| sessions | Sessões de karaokê, abertura, encerramento e configuração |
| participants | Check-in e vínculo entre pessoa e sessão |
| catalog | Músicas e sugestões sujeitas a aprovação |
| requests | Solicitações musicais e seus estados |
| stage | Fila sugerida, convocações e apresentações |
| audit | Registro de ações relevantes e motivos de intervenção |

- `endpoints/`: controllers REST, DTOs HTTP e validação de entrada; sem regras de negócio.
- `application/`: casos de uso, transações e coordenação do domínio.
- `domain/`: regras e estados de negócio.
- `infrastructure/`: persistência e adaptadores técnicos.

As APIs públicas de módulo ficarão no pacote raiz do módulo ou em interfaces nomeadas explicitamente pelo Modulith. Outro módulo não acessará seus repositórios ou detalhes internos. Dependências permitidas serão declaradas e verificadas por teste de arquitetura. O desenho exato dessas dependências será definido junto aos primeiros casos de uso, evitando ciclos.

## Frontend por funcionalidade

Uma SPA Angular para os três perfis, com carregamento de rotas por funcionalidade:

```text
frontend/src/app/
├── core/
│   ├── auth/
│   ├── http/
│   └── realtime/
├── layouts/
│   ├── participant/
│   ├── host/
│   └── musician/
├── features/
│   ├── sessions/
│   ├── check-in/
│   ├── catalog/
│   ├── requests/
│   └── stage/
│       ├── pages/
│       ├── components/
│       ├── services/
│       └── models/
├── shared/
│   ├── ui/
│   ├── components/
│   ├── directives/
│   ├── pipes/
│   └── validators/
└── app.routes.ts
```

`features/` reúne comportamento de negócio. `shared/` contém elementos genéricos reutilizáveis e não depende de features. `core/` concentra infraestrutura transversal, e `layouts/` organiza as três experiências. Um componente de fila continua em `features/stage` mesmo quando usado pelos três perfis. Componentes PrimeNG serão usados diretamente, criando componentes próprios apenas quando houver comportamento comum real.

Usaremos componentes standalone, TypeScript estrito, Reactive Forms tipados, Signals para estado de interface e RxJS para fluxos assíncronos. O servidor permanece a fonte oficial do estado operacional.

## Experiências

- Participante: check-in por link/QR Code, consulta ao catálogo, solicitações e acompanhamento de convocações.
- Anfitrião: gestão da sessão, inscrição assistida com nome, primeira música e mesa opcional, coleta de novos pedidos, aprovações, fila sugerida, confirmação de convocações e registro de apresentações.
- Músico: repertório, convocações confirmadas e acompanhamento do palco.

A entrada assistida é um fluxo principal e permite operar o evento sem celular dos participantes. Usa a mesma fila e política de prioridade da entrada autônoma. Pedidos seguintes reutilizam o cadastro existente; o ator autenticado continua sendo o anfitrião. Detalhes na [ADR 004](decisions/004-participation-and-repeat-suggestions.md).

## Regras estabelecidas

- Menor número de apresentações concluídas na sessão tem prioridade. Em empate, evitar repetição imediata da pessoa que acabou de concluir; depois priorizar pedido elegível e, persistindo empate, o check-in.
- O motor também sugere pessoas sem pedido, com “música a escolher”, sem criar pedido fictício. O anfitrião aprova antes da convocação.
- Múltiplas solicitações são balanceadas por pessoa; não geram múltiplas chamadas na mesma rodada.
- Catálogo híbrido admite sugestões sujeitas a aprovação.
- Fila sugerida e convocações confirmadas são conceitos separados. Recálculo não altera silenciosamente uma convocação.
- Só apresentação concluída aumenta a contagem, uma única vez.
- Saída voluntária encerra a participação e limpa o vínculo no navegador, preservando histórico; pedidos pendentes são cancelados quando esse recurso existir.
- Recusa pausa sugestões sem falta. Primeira falta confirmada pelo anfitrião suspende temporariamente; após uma rodada pode haver nova oportunidade. Segunda falta consecutiva inativa automaticamente por ausência e suspende pedidos pendentes. Conclusão zera faltas.
- Retorno após inativação exige confirmação do anfitrião, nova posição de chegada e preservação de apresentações concluídas.
- Operações relevantes precisam de auditoria e proteção contra concorrência.

A definição completa, exemplos e limites estão na [ADR 004 — Participação e sugestões de repetição](decisions/004-participation-and-repeat-suggestions.md).

## Pontos a validar antes do código de negócio

Limite e ordem de pedidos por pessoa; reservas na projeção e quantidade de convocações simultâneas; detalhes de rodada e da proteção contra repetição imediata; retomada após pausa; sequência de faltas e pedidos na reativação; reconhecimento após saída voluntária; responsáveis pela aprovação de catálogo e eventual participação em grupo. Nenhum incremento deve decidir esses pontos silenciosamente.

## Dados, auditoria e concorrência

PostgreSQL como banco transacional, migrações Flyway e validação de esquema pelo Hibernate. Não usar atualização automática de esquema em produção.

Proposta: controle otimista de versão em agregados e serialização das operações críticas do palco por sessão, dentro da transação. Restrições no banco devem impedir duplicações e vínculos entre sessões diferentes. Conclusão e confirmação precisam suportar retentativas sem duplicar efeitos.

Auditoria deve registrar ator, sessão, ação, alvo, instante, motivo quando aplicável e correlação. Mudança crítica e registro de auditoria devem ser persistidos atomicamente. Logs técnicos não substituem auditoria de negócio. Retenção e acesso aos dados ainda serão definidos.

## Segurança — desenho proposto

Spring Security no backend; permissões verificadas por operação e por sessão. Guards do Angular apenas orientam a navegação.

Proposta inicial: sessões em cookies HttpOnly, Secure em produção, proteção CSRF e publicação no mesmo domínio. Anfitriões e músicos autenticados; participante recebe identidade limitada à sessão após check-in. Nome de exibição não serve como credencial. O primeiro incremento implementa acesso do anfitrião provisionado por configuração, com senha BCrypt e sem cadastro público. Login/logout usam cookie de sessão e token CSRF obtido via API. Recuperação de acesso e identidade do participante autônomo ainda precisam de definição.

## REST e tempo real

REST para consultas e comandos, com DTOs próprios, Bean Validation, erros estruturados e OpenAPI. Propostas de URL e contrato serão revisadas no primeiro fluxo.

WebSocket/STOMP para notificação depois do commit. Assinaturas serão autorizadas por sessão e perfil. Mensagens não substituem o estado persistido: após reconexão, o frontend busca novamente o estado via REST. Começar com uma instância; múltiplas instâncias exigirão estratégia de distribuição e entrega. Garantias duráveis poderão exigir outbox, conforme o incremento.

## PWA e publicação

Frontend estático com fallback de rotas da SPA; `/api` e WebSocket encaminhados ao Spring no mesmo domínio. A hospedagem concreta ainda será escolhida.

Manifesto e service worker permitirão instalação e cache da interface. Mutações de pedidos e palco exigem conexão e confirmação do servidor. Dados autenticados não serão indiscriminadamente armazenados em cache. A interface deve informar desconexão e estado desatualizado.

## Identidade e qualidade

Cores: azul-marinho `#0B1E3F`, roxo `#7C3AED`, amarelo `#FBBF24`, fundo `#F4F6FA`. Fonte Manrope. Slogan: “Sua voz no palco, na ordem certa.” O logotipo oficial ainda não está disponível no repositório; não será recriado como se fosse o original.

Testes previstos: regras de fila, integração com PostgreSQL real via Testcontainers, segurança, concorrência, contratos e fluxos completos com Playwright. Acessibilidade deve incluir teclado, foco, rótulos e comunicação que não dependa só de cores.
