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
| audience | Entrada pública, links de sessão, credenciais e acesso limitado ao próprio participante |

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

Proposta inicial: sessões em cookies HttpOnly, Secure em produção, proteção CSRF e publicação no mesmo domínio. Anfitriões e músicos autenticados; participante recebe identidade limitada à sessão após check-in. Nome de exibição não serve como credencial. O primeiro incremento implementa acesso do anfitrião provisionado por configuração, com senha BCrypt e sem cadastro público. Login/logout usam cookie de sessão e token CSRF obtido via API. O módulo `audience` implementa identidade autônoma de 24 horas em cookie próprio HttpOnly, separada do anfitrião, com CSRF, token aleatório armazenado somente como hash, revogação, limites persistidos e rotação do link de entrada. Reutiliza as APIs públicas dos módulos existentes sob o mesmo bloqueio transacional da sessão. O servidor filtra o estado de palco e pedidos antes de responder, sem expor outros participantes. Recuperação entre dispositivos e transferência de cadastro assistido permanecem fora do recorte. Consulte o [roteiro do participante](acceptance/003-participant-flow.md).

## REST e tempo real

REST para consultas e comandos, com DTOs próprios, Bean Validation, erros estruturados e OpenAPI. Propostas de URL e contrato serão revisadas no primeiro fluxo.

WebSocket/STOMP para notificação depois do commit. Assinaturas serão autorizadas por sessão e perfil. Mensagens não substituem o estado persistido: após reconexão, o frontend busca novamente o estado via REST. Começar com uma instância; múltiplas instâncias exigirão estratégia de distribuição e entrega. Garantias duráveis poderão exigir outbox, conforme o incremento.

## PWA e publicação

Frontend estático com fallback de rotas da SPA; `/api` e WebSocket encaminhados ao Spring no mesmo domínio. A hospedagem concreta ainda será escolhida.

Manifesto e service worker permitirão instalação e cache da interface. Mutações de pedidos e palco exigem conexão e confirmação do servidor. Dados autenticados não serão indiscriminadamente armazenados em cache. A interface deve informar desconexão e estado desatualizado.

## Identidade e qualidade

Cores: azul-marinho `#0B1E3F`, roxo `#7C3AED`, amarelo `#FBBF24`, fundo `#F4F6FA`. Fonte Manrope. Slogan: “Sua voz no palco, na ordem certa.” O logotipo oficial ainda não está disponível no repositório; não será recriado como se fosse o original.

Testes previstos: regras de fila, integração com PostgreSQL real via Testcontainers, segurança, concorrência, contratos e fluxos completos com Playwright. Acessibilidade deve incluir teclado, foco, rótulos e comunicação que não dependa só de cores.

## Validação de contas e administração (V12)

O módulo `identity` concentra cadastro, confirmação de e-mail, situação da conta, autorização administrativa e sua auditoria. Mantemos o nome legado `host_accounts` para preservar referências, com um perfil principal HOST/MUSICIAN e uma permissão administrativa independente. O SMTP não é obrigatório para operar as contas existentes; é obrigatório para concluir novo cadastro e reenvio. O filtro de segurança consulta o estado atual de cada conta nas requisições protegidas, para não confiar em permissões antigas guardadas na sessão HTTP. A interface administrativa é carregada em `/admin`, sem item em menus públicos. A gestão do catálogo não faz parte deste incremento.

Configuração e aceite em [006-account-validation-and-admin.md](acceptance/006-account-validation-and-admin.md).

## Seleção de músicos e consulta administrativa (V13)

As contas recebem um identificador público UUID para o vínculo de músicos por nome, sem expor o e-mail ao anfitrião. O módulo `administration` agrega uma visão de consulta das sessões abertas, usando as APIs públicas de `identity`, `sessions`, `musicians` e `stage`. ADMIN é uma permissão de consulta transversal; a operação das filas continua sujeita à propriedade da sessão. Aceite em [007-musician-selection-and-admin-sessions.md](acceptance/007-musician-selection-and-admin-sessions.md).

### Operação de sessão por administrador (11/11/2026)

Administrador ativo também pode usar o painel do anfitrião para operar qualquer sessão, independente do perfil principal HOST/MUSICIAN. `sessions` consulta a permissão atual exposta por `identity`; a autorização central atende listagem, leitura e bloqueio para escrita. Anfitriões comuns mantêm isolamento por proprietário. Operações mantêm identidade do ator na auditoria e proprietário original da sessão. Consulta administrativa oferece atalho para `/anfitriao?sessao=<id>`. Regras de palco e encerramento permanecem obrigatórias. Ver [Aceite 010](acceptance/010-admin-host-access.md).

### Catálogo próprio e vínculos musicais (12/11/2026)

O módulo `catalog` depende de `identity` para administração. `requests` e `stage` usam sua API de resolução transacional para vincular músicas; o catálogo não depende desses módulos. A V14 migra snapshots antigos para entradas provisórias, mantém aliases e registra auditoria antes/depois. Unificações preservam IDs e textos históricos por redirecionamento canônico. Busca pública combina catálogo aprovado e Last.fm sem persistir resultados de pesquisa. Aprovação do catálogo não interfere na elegibilidade da fila. [Aceite e roteiro 011](acceptance/011-singflow-catalog.md).

### Sincronização assistida do catálogo (12/11/2026)

O módulo `catalog` mantém processamento persistente por lotes na V15. Um worker agendado reserva um item com token/lease, consulta Last.fm fora de transação e só então aplica resultados sob bloqueio e conferência de versão. Estados e candidatos ficam no PostgreSQL; fechar a tela não cancela o lote. Aprovação automática exige correspondência conservadora e única de título/artista; casos ambíguos são revisados pelo admin com comparação e confirmação de vínculo quando houver duplicata. As APIs `/api/admin/catalog/sync/**` são administrativas; a tela acompanha progresso por REST a cada dois segundos. [Roteiro e critérios 012](acceptance/012-catalog-synchronization.md).

Na revisão assistida, `CatalogRefinement` separa a leitura autorizada dos parâmetros, a consulta Last.fm fora da transação e a substituição versionada dos candidatos. O POST `/api/admin/catalog/sync/items/{id}/search` recebe título/artista do rascunho; não atualiza o cadastro nem aprova automaticamente. O catálogo só muda na confirmação de aprovação já existente.
