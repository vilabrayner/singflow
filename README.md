# SingFlow

Sua voz no palco, na ordem certa.

Plataforma de gestão de karaokê ao vivo para participantes, anfitriões e músicos, com check-in, solicitações musicais, catálogo híbrido, fila justa e convocações confirmadas.

## Estado do projeto

Fundação backend implementada: Spring Modulith, Flyway, Security e testes com PostgreSQL real. Frontend Angular 22 com PrimeNG 22 Community, layouts dos três perfis e testes de navegação implementados. Os fluxos de negócio ainda não estão implementados.

## Stack

| Área | Decisão |
| --- | --- |
| Backend | Java 21, Spring Boot, Spring Modulith |
| Dados | PostgreSQL, Spring Data JPA/Hibernate e Flyway |
| Segurança | Spring Security |
| Integração | REST/OpenAPI e WebSocket/STOMP |
| Frontend | Angular SPA, TypeScript estrito, componentes standalone |
| Interface | PrimeNG, Tailwind CSS, PrimeIcons e Manrope |
| Estado e formulários | Signals, serviços por feature, RxJS e Reactive Forms tipados |
| PWA | Manifesto e service worker do Angular |

Versões e validações da fundação estão registradas em [Fundação técnica](docs/foundation.md). Spring Boot 4.1.2 e Modulith 2.1.2 compilaram e passaram nos testes juntos.

## Organização

```text
singflow/
├── backend/             # Aplicação Java existente
├── frontend/            # Aplicação Angular SPA
├── docs/
│   ├── architecture.md
│   ├── roadmap.md
│   └── decisions/
└── README.md
```

## Execução do backend

Requisitos: Java 21, Docker com Compose em execução. Maven Wrapper fixa Maven 3.9.11.

Na raiz, copie as variáveis locais e suba o banco:

```sh
cp .env.example .env
# Revise as variáveis antes de iniciar.
docker compose --env-file .env -f backend/compose.yaml up -d --wait
```

Em um terminal a partir da raiz, exporte as variáveis e execute:

```sh
set -a
. ./.env
set +a
cd backend
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```

Health: `http://localhost:8080/actuator/health`. OpenAPI: `http://localhost:8080/v3/api-docs`. Swagger: `http://localhost:8080/swagger-ui/index.html` (documentação liberada somente no perfil local).

Configuração de conexão é obrigatória; não há credenciais de produção embutidas. Perfil `prod` exige cookies seguros e implantação HTTPS. Demais rotas permanecem negadas, sem login provisório. O `.env` é lido pelo Compose e exportado pelo shell acima; o Spring não o lê automaticamente. Se mudar porta ou nome do banco, ajuste também `DB_URL`.

Verificação completa, incluindo PostgreSQL temporário e isolado via Testcontainers:

```sh
cd backend
./mvnw -B verify
```

O teste completo passou localmente com Docker. Para verificar somente os limites de módulos, sem iniciar banco: `./mvnw -B test -Dtest=ArchitectureTests`.

Para parar o banco de desenvolvimento preservando seus dados, execute da raiz:

```sh
docker compose --env-file .env -f backend/compose.yaml down
```

O volume é persistente. Alterar variáveis de usuário/senha não altera um banco já inicializado. 

## Execução do frontend

Use Node 24.15.0 (`nvm install` e `nvm use` na raiz, caso utilize nvm). A versão global anterior, 24.11, não atende aos requisitos do Angular 22. Não há necessidade de Angular CLI global.

```sh
cd frontend
npm ci
# No primeiro início, config.json é criado sem sobrescrever um arquivo existente.
# Preencha primeUiLicense em public/config.json.
npm start
```

Abra `http://127.0.0.1:4200`. O servidor de desenvolvimento encaminha `/actuator` e `/api` para o backend em `localhost:8080`. As páginas iniciais estão em `/`, `/participante`, `/anfitriao` e `/musico`.

PrimeNG 22 e PrimeIcons 8 usam licença PrimeUI Community. O responsável escolheu uso pessoal; emita sua chave gratuita pelos [canais oficiais](https://primeui.dev/licenses/community) e observe a renovação anual. O modelo `frontend/public/config.example.json` é versionado. Os valores locais ficam em `frontend/public/config.json`, ignorado pelo Git e preservado pelos comandos de início e build. Não publique sua chave para reutilização por terceiros. Sem chave, o fornecedor exibe aviso; não há contorno da verificação.

Verificações:

```sh
npm run format:check
npm run test:config
npm run build
npx playwright install chromium
npm test
```

A saída estática fica em `frontend/dist/singflow-web/browser`. Uma hospedagem futura deve fornecer `config.json` por ambiente antes de liberar tráfego, aplicar fallback das rotas para `index.html` e encaminhar API/WebSocket. A configuração é carregada antes do Angular, sem exigir recompilação. Consulte [Configuração por ambiente](docs/runtime-configuration.md). O proxy Angular só existe no desenvolvimento. Não há PWA nem login funcional nesta etapa.

Os workflows em `.github/workflows/` verificam backend e frontend no GitHub Actions. Configure `PRIMEUI_LICENSE_KEY` nos secrets para os builds autorizados; a ausência não é tratada como chave válida. Os workflows ainda não foram executados no GitHub.

## Documentação

- [Arquitetura](docs/architecture.md)
- [Fundação técnica](docs/foundation.md)
- [Roadmap e critérios de aceite](docs/roadmap.md)
- [ADR 001 — Monólito modular](docs/decisions/001-modular-monolith.md)
- [ADR 002 — Frontend Angular SPA](docs/decisions/002-angular-spa.md)
- [ADR 003 — Interface e identidade visual](docs/decisions/003-ui-and-brand.md)

A implementação será feita em etapas, com autorização do responsável antes de cada nova etapa. Esta entrega não altera código, dependências ou infraestrutura, nem cria commits.
