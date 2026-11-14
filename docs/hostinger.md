# Frontend Node.js na Hostinger

O entry point `frontend/server.js` inicializa o processo mesmo quando importado pelo carregador da Hostinger. A implementação fica em `frontend/scripts/frontend-server.mjs` e entrega o build Angular e encaminha `/api`, `/api/*` e `/actuator/health` para `BACKEND_URL`. A URL é lida ao iniciar o processo: mudar o backend não exige novo commit nem recompilação do Angular. Reiniciar a aplicação após alterar a variável. O navegador continua usando `/api` no domínio do frontend, com cookies e CSRF existentes.

## Configuração no painel

| Campo | Valor |
| --- | --- |
| Branch | A branch que o responsável publicar |
| Root directory | `frontend` |
| Framework preset | **Other**, com servidor Node.js; não publicar como Angular estático |
| Node.js | 24.x (referência local em `.nvmrc`: 24.15.0) |
| Build command | `npm run build` |
| Output directory | `dist/singflow-web/browser` |
| Entry file | `server.js` |

`server.js` existe tanto na raiz `frontend` quanto no pacote de saída. O `postbuild` copia o entry point, seu carregador de ambiente e um `package.json` mínimo para o artefato. O servidor funciona em ambos os diretórios, sem dependências npm de produção. Se o painel pedir o entry file relativo à raiz do código em vez do artefato, `server.js` também está nessa raiz. Se houver campo de comando de início: `npm run start:prod` na raiz `frontend`, ou `npm start` dentro do pacote de saída. Não usar o `npm start` de desenvolvimento para hospedar produção.

A Hostinger documenta o preset Other com entry file para aplicações que precisam de um servidor ativo. Se o painel só mostrar saída estática e não iniciar o entry point, revisar o preset antes de publicar: servir apenas os arquivos não encaminha a API.

## Variáveis a importar na Hostinger

```dotenv
BACKEND_URL=https://singflow.onrender.com
PRIMEUI_LICENSE_KEY=
```

Preencher a licença própria ou manter o valor válido incluído no build. No Node, se `PRIMEUI_LICENSE_KEY` estiver definida, ela prevalece sobre a licença do artefato; variável vazia significa licença vazia. Para preservar o valor do artefato, omitir a variável. Não colocar valores privados do backend neste bloco. O modelo `frontend/.env.example` tem apenas variáveis do frontend; `.env.example` na raiz é a referência consolidada por serviço.

`PORT` é fornecida pela plataforma. O servidor usa `0.0.0.0` e essa porta; o padrão 3000 serve ao ensaio independente. Não sobrescrever a porta da hospedagem.

`BACKEND_URL` deve ser uma origem HTTPS, sem caminho, query, fragmento ou usuário/senha. HTTP é aceito apenas em loopback para ensaio. Ausência ou formato inválido impede iniciar o servidor; não existe backend de produção fixado no código.

A licença pode vir do ambiente na inicialização do Node, sem alterar o bundle. O build continua preparando `config.json` e preservando um arquivo local existente. O servidor exige `apiBaseUrl=/api` e entrega `config.json` com `Cache-Control: no-store`.

## Backend no Render

Manter os valores já configurados pelo responsável. A referência pública do frontend é `SINGFLOW_PUBLIC_APP_URL=https://singflow.flowave.tec.br`, usada no backend para QR Codes e e-mails. Essa variável não substitui `BACKEND_URL`. Banco, SMTP, Last.fm e perfis continuam exclusivos do backend.

## Desenvolvimento e Docker

- `npm start` continua iniciando o Angular de desenvolvimento com proxy local existente.
- `npm run build` gera a SPA e o pacote Node.js de produção.
- `npm run start:prod` inicia o servidor de produção na raiz `frontend`; o responsável executa o comando pela IDE.
- Alternativamente, no artefato `dist/singflow-web/browser`, `npm start` inicia o servidor pronto.
- Docker/Compose continuam usando Nginx e seu proxy para o serviço `backend`; a variável `BACKEND_URL` é do servidor Node.js, não substitui a configuração do Nginx.

## Conferência após o deploy pelo responsável

1. `/config.json` responde JSON com `/api`, sem cache.
2. `/actuator/health` responde o health do backend, sem HTML.
3. Uma rota `/api/...` ausente ou negada mantém o erro do backend, sem cair no Angular.
4. Abrir e recarregar `/anfitriao`, `/musico`, `/admin` e links de participante.
5. Entrar, recarregar, criar sessão de ensaio e sair: cookies e CSRF precisam funcionar no domínio público.
6. Conferir QR Code e link do e-mail com o domínio novo.
7. Para mudar o host da API futuramente: alterar `BACKEND_URL` e reiniciar o processo pelo painel. Não há alteração de código; a plataforma pode solicitar reaplicar a configuração do ambiente.

Testes locais usam servidores HTTP temporários e não a conta de produção. O deploy e o comportamento do proxy da Hostinger exigem esta conferência no ambiente real. O servidor atual encaminha HTTP; não implementa notificações WebSocket.

## Referências

- [Configuração de aplicações e preset Other na Hostinger](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/)
- [Limites do runtime Node.js da Hostinger](https://www.hostinger.com/support/hostinger-node-js-limits-for-web-and-cloud-plans/)
