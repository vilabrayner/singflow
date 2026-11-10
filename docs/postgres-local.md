# PostgreSQL da máquina — preparação e Flyway

O script de preparação cria banco e usuário PostgreSQL. Flyway conecta nesse banco para criar as tabelas. O anfitrião é uma conta da aplicação, diferente do usuário PostgreSQL.

Nenhum comando foi executado na instância nesta entrega. Inicie o PostgreSQL e execute os comandos pelo terminal da IDE. O cliente encontrado na máquina é `psql` 16.10; isso não confirma a versão nem a porta do servidor.

## 1. Preparar banco e usuário

Na raiz do repositório, substitua `SEU_USUARIO_ADMIN` por uma conta administrativa existente, capaz de criar roles e bancos e atribuir o banco a `singflow`. Confirme a porta e ajuste se necessário.

```sh
psql -X -h localhost -p 5432 -U SEU_USUARIO_ADMIN -d postgres -f backend/scripts/postgres/prepare-local.psql
```

Esse arquivo usa comandos do `psql`, não deve ser executado integralmente em editor SQL genérico. Não use `--single-transaction` ou `-1`: `CREATE DATABASE` precisa executar fora de transação.

O script:

- Cria `singflow` como usuário de login, sem privilégios administrativos globais.
- Solicita senha pelo comando seguro `\password`, sem incluí-la no arquivo versionado ou no histórico SQL.
- Cria o banco `singflow`, UTF-8, com esse usuário como proprietário.
- Preserva banco e usuário existentes compatíveis, inclusive senha, sem apagar dados.
- Interrompe se o banco tiver outro proprietário ou a role existente tiver atributos incompatíveis; não altera essas situações automaticamente.
- Serializa execuções deste mesmo script no banco de manutenção por bloqueio consultivo; não protege contra alterações administrativas externas.

A preparação não é uma transação única. Se o prompt for interrompido ou a criação do banco falhar depois da role, o usuário poderá já existir. Corrija a causa e execute novamente. Se precisar definir a senha de uma role criada sem completar o prompt, conecte como administrador e execute `\password singflow` explicitamente. Não é necessário apagar banco ou usuário.

Não existe senha padrão no script. Escolha uma senha e configure o backend com o mesmo valor. Para produção, separação de usuário migrador e de execução será avaliada; esta preparação usa o proprietário do banco para permitir migrações locais.

## 2. Conferir conexão

```sh
psql -X -h localhost -p 5432 -U singflow -d singflow -c 'SELECT current_database(), current_user;'
```

A senha pode ser solicitada no terminal. Não a coloque na linha de comando nem envie no chat. Se continuar ocorrendo “role does not exist”, confira host e porta: pode haver outra instância ou contêiner.

## 3. Configurar a execução Java

Para `SingflowApplicationLocal`, preencha o `.env` da raiz ou configure as variáveis da execução na IDE (que têm precedência):

```text
DB_URL=jdbc:postgresql://localhost:5432/singflow
DB_USERNAME=singflow
DB_PASSWORD=<senha escolhida para o PostgreSQL>
SINGFLOW_HOST_EMAIL=<seu e-mail de anfitrião>
SINGFLOW_HOST_PASSWORD=<senha da aplicação>
```

As senhas do banco e da aplicação são independentes. A senha da aplicação precisa de pelo menos 12 caracteres e no máximo 72 bytes UTF-8. Não colocar os valores em arquivos versionados.

O inicializador ativa `local`. O padrão desse perfil continua sendo o banco Docker na porta 55432; `DB_URL` acima o substitui para usar a instância instalada. Não é necessário iniciar PostgreSQL Docker neste modo.

## 4. Aplicar e conferir migrações

Execute `SingflowApplicationLocal` pela IDE. Flyway aplica automaticamente:

| Migração | Efeito |
| --- | --- |
| V1 | Esquema `singflow` |
| V2 | Tabelas `host_accounts`, `sessions`, `participants`, `song_requests` e `audit_events`, índices, restrições e sequência de check-in |

O histórico fica em `public.flyway_schema_history`. Hibernate valida o esquema, sem atualizá-lo automaticamente.

Após iniciar o backend:

```sh
psql -X -v ON_ERROR_STOP=1 -h localhost -p 5432 -U singflow -d singflow -f backend/scripts/postgres/verify-migrations.sql
```

O segundo script só consulta histórico, tabelas e quantidade de anfitriões. Antes das migrations, as consultas às tabelas ainda inexistentes falharão.

V1 e V2 foram revisadas e preservadas, pois já houve validação com elas. Mudanças futuras entram em novas migrações. Não execute os arquivos Flyway manualmente, edite checksums ou use baseline/clean para contornar erros.

## Conta inicial e perfis

Depois das migrações, a configuração existente provisiona o anfitrião quando o e-mail ainda não existe, armazenando senha como hash BCrypt. Reiniciar não redefine senha existente. Não há credenciais da aplicação nas migrations.

A autorização atual usa o papel `HOST`, atribuído na autenticação. Um perfil `ADMIN`, suas permissões e tabela de papéis não foram definidos nem implementados. A preparação do banco não concede poderes administrativos implícitos na aplicação.

## Validação

Revisão estática do script e das migrations e conferência dos links. Nenhum banco ou usuário foi criado nesta entrega. A execução e a validação de permissões na instância local continuam pendentes.

Referências: [psql](https://www.postgresql.org/docs/current/app-psql.html) e [CREATE DATABASE](https://www.postgresql.org/docs/current/sql-createdatabase.html).

## Carregamento local do `.env`

Somente `SingflowApplicationLocal`, em `src/test/java`, usa dotenv-java, com dependência de escopo `test`. Execute pela raiz ou por `backend/`; o arquivo lido é sempre o `.env` da raiz. Não é incluído no JAR de produção. O carregamento não modifica variáveis globais nem imprime valores. Reinicie o backend pela IDE para reler o arquivo.

A aplicação principal e a imagem Docker continuam recebendo variáveis pelo ambiente. Não foi adicionada conta padrão às migrations. A criação inicial do anfitrião usa as variáveis de provisionamento existentes; e-mails já cadastrados não têm senha redefinida.
