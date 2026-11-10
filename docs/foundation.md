# Fundação técnica — etapa 1

Este documento registra a fundação original. A evolução de login, entidades e inscrição assistida está descrita em [Teste local do primeiro incremento](local-mvp-testing.md).

## Backend

Java 21, Spring Boot 4.1.2 e Spring Modulith 2.1.2. Versões transitivas de JPA/Hibernate, Security, Flyway e Testcontainers gerenciadas pelos BOMs Spring Boot/Modulith. OpenAPI mantém springdoc 3.2.0 existente. Maven Wrapper 3.9.11 configurado.

O único módulo com implementação nesta etapa é `identity`, contendo a configuração de segurança. Os demais surgirão com os casos de uso, sem classes artificiais para preencher a estrutura.

O Flyway cria o esquema técnico `singflow` em V1; tabelas de domínio ficam para os incrementos aprovados. O Hibernate usa `validate`. Ainda não há entidades JPA, portanto a validação de mapeamentos será efetivamente exercitada quando elas forem adicionadas.

### Segurança

- Health público e sem detalhes internos.
- OpenAPI e Swagger disponíveis somente com perfil `local`.
- Demais rotas negadas por padrão; CSRF preservado.
- Sem login, Basic Auth ou usuário gerado.
- Perfil `prod` exige cookie Secure; publicação deverá usar HTTPS.

### Banco local

PostgreSQL 17.6 fixado, volume persistente, healthcheck e porta 55432 vinculada somente ao endereço local. Compose inicia explicitamente; a inicialização automática pelo Spring foi desativada para evitar comportamento dependente do diretório de execução.

Não reutilizar a senha de exemplo em ambientes publicados. A aplicação falha sem as variáveis de conexão. Não há perfil local ativado implicitamente.

### Verificações

`ArchitectureTests` verifica limites do Modulith. `SingflowApplicationTests` usa PostgreSQL real com Testcontainers e valida migração, health, bloqueio de rotas e CSRF. O teste não é ignorado quando Docker está indisponível: Docker é requisito da verificação completa.

## Fora desta entrega

Login funcional, entidades de domínio, fila, WebSocket e instalação PWA serão implementados nos incrementos próprios. As telas da fundação não devem sugerir que pedidos, convocações ou sessões estejam operacionais.

## Resultado da verificação backend

Executado `./mvnw -B verify`: compilação e empacotamento aprovados, com três testes passando (arquitetura e duas verificações de integração), sem testes ignorados. O teste de integração usa PostgreSQL 17.6 real e confirma migração e regras de acesso. A subida manual do Compose e do servidor no perfil local também foi validada, incluindo OpenAPI e conexão real do frontend pelo proxy. A porta local do PostgreSQL é 55432, pois 5432 já estava ocupada no computador.

## Frontend

O responsável confirmou uso pessoal e escolheu Angular 22 com PrimeNG 22 Community. Node 24.15.0 está fixado em `.nvmrc`; a instalação global do computador não foi alterada. Angular 22.2.5, CLI/build 22.2.6, PrimeNG 22.1.4, temas PrimeUIX 3.1.0 e PrimeIcons 8.0.2. Dependências diretas e lockfile estão fixados.

O tema parte de Aura com roxo SingFlow. Tailwind cuida da composição e layout. Manrope é servida localmente via pacote de fonte. A marca textual e o ícone de microfone são provisórios: não representam o arquivo do logotipo oficial.

Rotas `/`, `/participante`, `/anfitriao` e `/musico` usam carregamento por demanda; rota desconhecida apresenta página própria. Os layouts reutilizam um componente em `shared/`. A única chamada real de API é a verificação explícita de saúde do backend, com tempo limite e opção de repetir.

### Licença Community

A versão 22 usa licença PrimeUI Community, não MIT. Para uso pessoal, o responsável deve emitir sua chave gratuita e renová-la anualmente conforme os termos oficiais: https://primeui.dev/licenses/community . A licença não foi emitida nem aceita em nome do responsável.

`public/config.example.json` define o modelo versionado. `public/config.json` contém os valores por ambiente, é ignorado pelo Git e carregado antes da inicialização Angular. `prestart` e `prebuild` criam esse arquivo somente se ausente e preservam seus valores. `PRIMEUI_LICENSE_KEY` pode alimentar apenas a criação inicial (por exemplo, no CI). Não há chave incluída no repositório. A configuração é pública no navegador; não colocar senhas ou segredos nela. A ausência da chave pode exibir aviso do fornecedor, que não é removido ou contornado. Cada colaborador deverá observar suas próprias condições de licença.

### Execução e testes

`npm ci`, `npm run build`, `npm run format:check` e `npm test` são os comandos de verificação. Playwright requer instalação de Chromium. Os testes verificam navegação, recarga direta das rotas, ausência de transbordamento horizontal, tratamento da conexão com backend, rota desconhecida e atalho de teclado em desktop e celular. As respostas do backend nesses testes de interface são simuladas; os testes Java usam banco real.

PWA, WebSocket e login permanecem fora desta etapa. Não há fluxo de pedidos nem dados fictícios apresentados como reais.

## Resultado da verificação frontend

Build de produção e seis testes Playwright aprovados, em Chromium desktop e emulação de celular. Build inicial: aproximadamente 504 kB brutos e 116 kB estimados em transferência, com aviso por exceder o limite de referência de 500 kB em 4 kB. O limite não foi elevado para ocultar o aviso. A chave Community ainda não foi fornecida; o aviso legítimo do fornecedor permanece. A versão local de Node usada na validação foi 24.15.0, isolada em `.tools/` (ignorada pelo Git).

## Revisão — configuração em tempo de execução

Carregamento de `config.json` antes do bootstrap, validação de tipos e timeout de 10 segundos. Erros de configuração impedem a inicialização e mostram orientação sem revelar valores. Uma chave vazia permite iniciar com aviso; a validade da licença é verificada pelo fornecedor. A configuração local não é sobrescrita. Migração de `config.js` antigo ocorre na criação inicial, quando possível, sem executar o JavaScript legado.

Os testes de configuração rodam sem serviços. Os seis testes de interface mencionados acima foram executados na fundação anterior; após esta revisão, a validação no navegador deve ser feita com o serviço iniciado pelo responsável na IDE.
