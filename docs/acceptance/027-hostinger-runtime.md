# Frontend Node.js parametrizável

## Preparação

- Build Angular e servidor Node.js sem dependências externas de runtime.
- Artefato `dist/singflow-web/browser` contém `server.js`, carregador de ambiente e `package.json` de produção.
- `BACKEND_URL` obrigatória no início do Node; `PORT` fornecida pela plataforma, padrão 3000 para ensaio local.
- `npm start` de desenvolvimento preservado; produção via `npm run start:prod` ou entry file.
- Removida geração de regras do Netlify; Hostinger deve iniciar servidor ativo, conforme docs/hostinger.md.
- Modelos de ambiente agrupados em comuns, backend e frontend, sem copiar segredos entre serviços. Foram incluídas a flag da sincronização e o limite de cadastro de músicos.

## Validação local

Build concluído; 17 testes de configuração/runtime passaram e a verificação de formatação passou. Testes usam servidores HTTP temporários: cookies, CSRF, métodos/corpos/queries, redirecionamentos, erros HTTP, timeout, indisponibilidade, rotas da SPA, cache, proteção dos arquivos de servidor e troca de upstream sem reconstruir o mesmo artefato. Auditoria dos nomes de variáveis consumidas pelo código não encontrou ausência no modelo.

Nenhum serviço real foi iniciado/reiniciado, nem foram alterados os arquivos .env reais. Nenhum commit, push ou deploy foi realizado. Não há alteração de backend ou migration. Docker/Compose continuam com Nginx; arquivos do runtime Node não são públicos nesse servidor.

## Aceite em produção pelo responsável

Seguir docs/hostinger.md: configurar preset com servidor Node e entry file, variáveis de runtime, publicar e conferir health/API, recarga das rotas, login persistente, logout, QR Code e participante no celular. Cookies reais e o comportamento do painel/proxy da Hostinger ainda exigem esse ensaio; os testes locais não substituem a validação da hospedagem.
