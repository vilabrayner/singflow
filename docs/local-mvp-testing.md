# Primeiro incremento — teste local

## O que está nesta entrega

Login do anfitrião com cookie de sessão e CSRF; criação, abertura e encerramento de sessões; inscrição assistida com primeira música; busca por nome/mesa; novos pedidos no mesmo cadastro; saída com cancelamento dos pedidos pendentes; auditoria persistida. Dados e permissões são separados por anfitrião.

Participação assistida não depende de QR Code ou celular. A lista apresentada é ordem de check-in, não a fila sugerida. Sugestões, convocações, faltas, retorno/reativação e check-in autônomo ainda não estão implementados.

## Preparação comum

Os serviços são iniciados, reiniciados e encerrados pelo responsável na IDE. Não houve publicação nem criação de commits nesta entrega.

1. Na raiz, confira `.env`. Se ainda não existir, copie `.env.example`. Preserve seus valores existentes.
2. Acrescente `SINGFLOW_HOST_EMAIL` e `SINGFLOW_HOST_PASSWORD` usando seu e-mail e uma senha própria com pelo menos 12 caracteres e no máximo 72 bytes UTF-8. Coloque valores com caracteres especiais entre aspas compatíveis com o shell e Compose.
3. Confira `frontend/public/config.json`, incluindo sua chave PrimeUI e `apiBaseUrl` igual a `/api`.

O backend provisiona a conta somente quando o e-mail ainda não existe. A senha é armazenada como hash BCrypt, nunca em texto simples no banco. Não há redefinição automática: trocar a variável de senha depois não troca a senha de uma conta existente. Não há cadastro público nem recuperação de senha nesta entrega.

Sem variáveis de anfitrião, o backend pode iniciar, mas não cria acesso provisório. Se somente parte das variáveis for definida ou os valores forem inválidos, a inicialização falha com orientação sem exibir a senha.

## PostgreSQL instalado na máquina

Se preferir a instância nativa, siga [Preparação do PostgreSQL local](postgres-local.md). O script cria banco e usuário; Flyway cria as tabelas. Configure a porta da instância em `DB_URL` na execução da IDE.

## Modo A — serviços independentes

Docker e Java 21 disponíveis; Node 24.15.0 conforme `.nvmrc`.

No terminal da IDE, na raiz:

```sh
docker compose --env-file .env -f backend/compose.yaml up -d --wait
```

Em outro terminal, na raiz, exporte o ambiente e inicie o backend:

```sh
set -a
. ./.env
set +a
cd backend
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```

No terminal do frontend:

```sh
cd frontend
npm ci
npm start
```

Abra http://127.0.0.1:4200/anfitriao . Backend: porta 8080; banco Compose isolado na porta 55432 por padrão. Se usar seu PostgreSQL já instalado na porta 5432, ajuste `DB_URL`, `DB_USERNAME` e `DB_PASSWORD` e não inicie outro banco desnecessariamente. Os defaults locais existentes no YAML foram preservados, mas o perfil `prod` exige variáveis explícitas.

### Inicializador Java na IDE

Execute o `main` de `backend/src/test/java/br/tec/flowave/singflow/SingflowApplicationLocal.java`. A classe ativa o perfil `local` e inicia a aplicação principal com o classpath de testes; não cria banco nem sobe Docker. Não é um teste JUnit e não é executada por `mvn test`. Como está em `src/test/java`, não entra no JAR de produção.

No perfil local, a conexão padrão é `localhost:55432/singflow`, usuário `singflow` e senha de desenvolvimento `singflow_local`, conforme os exemplos do Compose. Se seu banco usa outros valores, defina `DB_URL`, `DB_USERNAME` e `DB_PASSWORD` na configuração de execução da IDE. Esses valores de ambiente têm precedência. O inicializador local lê o `.env` da raiz usando dotenv-java, com suporte a valores entre aspas. Execute com diretório de trabalho na raiz ou em `backend/`. Variáveis da IDE, propriedades JVM e argumentos mantêm precedência sobre o arquivo. Se o `.env` não existir, a configuração da IDE continua disponível. Arquivo inválido interrompe a inicialização sem exibir valores.

No `.env` da raiz ou na configuração de execução da IDE, forneça `SINGFLOW_HOST_EMAIL` e `SINGFLOW_HOST_PASSWORD` para provisionar o acesso inicial. Essas credenciais não estão no Java nem no YAML. Reinicie o backend pela IDE após fornecer o acesso inicial. Frontend e PostgreSQL continuam sendo iniciados separadamente pelo responsável.

Para parar, use Ctrl+C nos terminais e execute, da raiz:

```sh
docker compose --env-file .env -f backend/compose.yaml down
```

Esse comando preserva o volume. Não use `down -v` se quiser manter os dados.

## Modo B — imagens Docker

O Compose da raiz é separado do Compose de banco em `backend/`. Usa um volume próprio e não reaproveita os dados do modo A.

Após preencher `.env` e `frontend/public/config.json`, na raiz:

```sh
docker compose build
docker compose up -d
```

Abra http://127.0.0.1:8081/anfitriao . A porta pode ser alterada por `WEB_PORT`. PostgreSQL e backend ficam na rede interna; o frontend Nginx encaminha a API para o backend. Aguarde o backend concluir as migrações; se necessário confira seus logs, sem compartilhar credenciais.

A chave local não entra no contexto de build da imagem. `config.json` é montado somente para leitura no Nginx em tempo de execução; precisa existir como arquivo antes do `up`. A criação automática de diretório nesse caminho foi desativada para evitar configuração inválida.

Este Compose é para teste HTTP local, publicado somente em loopback. HTTPS, cookies Secure, hospedagem e backup de produção precisam de configuração própria depois dos testes. As imagens base usam tags; fixação por digest e revisão para publicação ficam para a preparação de produção.

```sh
docker compose logs --tail=100 backend
docker compose down
```

Evite testar os dois modos simultaneamente no mesmo navegador: cookies do mesmo host podem ser compartilhados entre portas. Encerre a sessão antes de trocar de modo. Os volumes separados permitem repetir o ensaio sem confundir os bancos.

## Roteiro de aceite manual

1. Entre como anfitrião; senha incorreta deve ser recusada.
2. Crie “Ensaio Café Tão”. A sessão inicia em rascunho; abra-a para inscrever.
3. Cadastre Ana, Bruno e Carla com mesa opcional e uma música cada. Confira ordem de chegada.
4. Busque Ana e acrescente uma segunda música usando “Adicionar música”. Deve continuar existindo uma única participação de Ana, com duas músicas.
5. Recarregue a página. A conta e os dados devem continuar disponíveis.
6. Registre a saída de Bruno. Seus pedidos pendentes são cancelados e a participação continua no histórico como “Saiu”. O anfitrião continua autenticado.
7. Encerre a sessão. Novas inscrições e músicas deixam de ser permitidas; leitura do histórico continua disponível. Não há reabertura nesta versão.
8. Reinicie os serviços preservando o volume e confira os dados.
9. Saia da conta. O painel não deve continuar acessível sem login.

Nomes e mesas iguais não geram união automática de pessoas. A busca ajuda a evitar duplicidade, mas o anfitrião confirma a identidade. Novos pedidos não mudam check-in. Artista é opcional e a música é texto livre neste incremento.

## Verificações automatizadas

Sem iniciar serviços:

```sh
cd backend
./mvnw -B test -Dtest=ArchitectureTests
```

```sh
cd frontend
npm run test:config
npm run format:check
npm run build
```

O teste completo do backend deve ser iniciado pelo responsável na IDE:

```sh
cd backend
./mvnw -B verify
```

Esse comando usa Testcontainers: cria e encerra PostgreSQL temporário isolado no Docker. Não usa nem limpa seu banco de desenvolvimento. Testa migrações, acesso, login/logout, inscrição e pedidos, isolamento por anfitrião, saída, validação e retentativas concorrentes.

Com o frontend já iniciado pelo responsável, `npm test` em `frontend/` executa Playwright com respostas de API simuladas. Fora do CI, os testes não iniciam servidor automaticamente. Testam tanto desktop como celular; o fluxo real com banco é validado pelo teste Java e pelo roteiro manual. No CI, o workflow pode iniciar seu servidor isolado.

## Estado da validação nesta entrega

- Compilação Java e verificação Modulith: aprovadas; testes de integração compilados.
- Compilação Angular: aprovada, com aviso de orçamento inicial (~528 kB, limite de referência 500 kB).
- Cinco testes de configuração: aprovados.
- Oito testes de interface: aprovados em desktop e celular, usando API simulada no frontend já ativo.
- Imagens backend e frontend: compiladas, sem iniciar os serviços finais.
- Integração PostgreSQL: responsável informou `BUILD SUCCESS` no `verify` do backend.
- Aceite manual dos dois modos: concluído e informado pelo responsável, com persistência após reinício. Registro em [Aceite 001](acceptance/001-assisted-flow.md).

Nenhum resultado de compilação substitui a validação funcional com banco real.
