# ADR 002 — Frontend Angular SPA

Estado: implementado na fundação com Angular 22.2.5; versões e configuração em `docs/foundation.md`.

## Contexto

O frontend ainda está vazio. O produto tem três experiências operacionais consumindo regras centralizadas no Spring. A proposta inicial com Next.js foi revista em favor de Angular.

## Decisão

Adotar Angular como SPA, TypeScript estrito, componentes standalone, Router com carregamento por feature, HttpClient, Reactive Forms tipados, Signals e RxJS. Organizar o código em `features/`, `shared/`, `core/` e `layouts/`.

Prever PWA com manifesto e service worker oficial do Angular. Operações de negócio continuam online e confirmadas pelo backend. Não adotar SSR no primeiro incremento.

## Consequências

Next.js, React, React Hook Form e shadcn/ui deixam de fazer parte da proposta. A hospedagem precisa de fallback para rotas da SPA e encaminhamento de API/WebSocket. Guards não substituem autorização no backend. Gerenciamento global adicional de estado será avaliado apenas se necessário.
