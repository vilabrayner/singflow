# Frontend no Netlify

Configuração preparada localmente; publicação e validação do ambiente continuam sob responsabilidade do usuário. Nenhum commit, push ou deploy está autorizado por esta preparação.

## Campos no painel

| Campo | Valor |
| --- | --- |
| Branch | `main` |
| Base directory | `frontend` |
| Package directory | Vazio |
| Build command | `npm run build` |
| Publish directory | `dist/singflow-web/browser` |
| Functions directory | Vazio |

O Netlify instala as dependências no diretório base. O comando de build compila o Angular e seu `prebuild` prepara o `public/config.json` a partir do modelo versionado. O diretório de publicação é relativo ao diretório base.

Configurar variáveis de ambiente para o build no painel:

- `NODE_VERSION=24.15.0`.
- `BACKEND_URL=https://singflow.onrender.com`: origem do backend, sem `/api` ou credenciais.
- `PRIMEUI_LICENSE_KEY`: a chave PrimeUI do responsável. Não gravar seu valor no Git. A configuração gerada é entregue ao navegador para a validação da licença pelo fornecedor; essa chave não é uma credencial do backend.

Para `PRIMEUI_LICENSE_KEY`, não selecionar **Contains secret values**: ela é usada no frontend e aparece no `config.json` publicado. Marcar como segredo ativa varredura do valor e pode bloquear a publicação. Isso corrige a orientação inicial sobre a caixa de segredo. Manter as proteções normais para credenciais reais; não desabilitar a varredura global.

`apiBaseUrl` permanece `/api`. Uma variável `API_URL` no painel, sozinha, não altera o frontend: o código atual lê `config.json` e aceita apenas caminho da mesma origem.

## URL do backend por ambiente

Localmente, `frontend/.env` define `BACKEND_URL=https://singflow.onrender.com`. O modelo versionado é `frontend/.env.example`; o `.env` real é ignorado pelo Git. As variáveis do processo/Netlify têm prioridade sobre esse arquivo. Se a variável estiver ausente, o build usa o endereço atual do Render. Uma variável vazia ou inválida interrompe a geração.

No Netlify, adicionar `BACKEND_URL` às variáveis disponíveis durante o **build**, no contexto de Production (e Preview, se usado). O `.env` local não é enviado automaticamente. Ao mudar o host, alterar essa variável e executar um novo deploy do frontend. O Netlify não substitui variáveis diretamente dentro de `_redirects`; o script faz isso durante o build. Usar `npm run build`, pois executar apenas `ng build` não gera as regras.

`PRIMEUI_LICENSE_KEY` também pode ser lida de `frontend/.env` ao criar `config.json`; um `config.json` já existente continua preservado. Essa configuração não muda o proxy local do Angular nem o Nginx do Docker.

## Encaminhamento e rotas

O Angular copia os arquivos públicos; ao final de `npm run build`, o `postbuild` gera `dist/singflow-web/browser/_redirects` usando `scripts/redirects.template`:

- `_redirects` encaminha `/api/*` para `${BACKEND_URL}/api/:splat`, preservando o prefixo `/api`. Encaminha também `/actuator/health`.
- A última regra entrega `index.html` para rotas da SPA, incluindo `/anfitriao` e links de participante. As regras de API precisam vir antes desse fallback.
- `_headers` evita cache de `config.json` e exige revalidação de `index.html`. Cabeçalhos das respostas da API continuam sob controle do backend, pois as regras de cabeçalhos estáticos não configuram respostas de proxy.

Essa configuração mantém os pedidos do navegador na origem do frontend, com cookies e CSRF no modelo existente. O proxy de desenvolvimento Angular e o Nginx do Docker não são usados pelo Netlify. A disponibilidade do backend e o funcionamento integrado dos cookies ainda precisam ser validados no ambiente publicado.

## Backend e validação após deploy autorizado

No ambiente do backend, usar `SPRING_PROFILES_ACTIVE=prod` e definir `SINGFLOW_PUBLIC_APP_URL` como a origem HTTPS real do frontend Netlify, sem caminho final. Essa variável monta os links/QR Codes e não define o destino das chamadas de API. Banco de dados e credenciais do backend não pertencem às variáveis públicas do frontend.

Depois que os arquivos estiverem na branch publicada, o responsável pode executar o deploy e conferir:

1. `/config.json`: resposta JSON com `apiBaseUrl` igual a `/api` e cabeçalho `Cache-Control: no-store`.
2. `/actuator/health`: resposta do backend com `status: UP`, sem HTML do Angular.
3. Abrir `/anfitriao` diretamente e recarregar a página.
4. Entrar, atualizar a página e confirmar que o login permanece válido; sair da conta e confirmar que foi encerrado.
5. Criar/abrir sessão de teste, conferir que o QR usa o domínio do frontend e validar o fluxo de participante em outro navegador.

Se uma chamada `/api/...` retornar HTML, verificar a presença e a ordem do `_redirects` publicado. Erros do proxy também podem indicar backend indisponível ou proteção de acesso no provedor; não assumir que o build do frontend validou a API.

## Referências

- [Monorepos no Netlify](https://docs.netlify.com/build/configure-builds/monorepos/)
- [Rewrites e proxies](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/)
- [Cabeçalhos personalizados](https://docs.netlify.com/manage/routing/headers/)

- [Secrets Controller e varredura de valores marcados como segredo](https://docs.netlify.com/build/environment-variables/secrets-controller/)
