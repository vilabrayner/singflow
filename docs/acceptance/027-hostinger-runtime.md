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

## Inicialização pela Hostinger

O primeiro ensaio com processo Node identificou que a Hostinger importa o entry point e rejeita a guarda de execução direta. O entry point agora inicia incondicionalmente e delega a implementação para scripts/frontend-server.mjs. Um teste de processo separado simula importação via Node e confirma listen e entrega da SPA. Os 18 testes passaram e o build foi concluído. A correção foi preparada localmente para versionamento pelo responsável.

## Publicação verificada — 13/11/2026

Após autorização explícita, configurações da Hostinger alteradas para Other/server.js e publicado pacote baseado na main (f78faa42) com a correção de inicialização por importação. Deploy concluído: 01a1d6df-a527-7342-9cad-0b08947bb40c. Variáveis existentes preservadas e auto-deploy da main mantido.

Verificado no domínio público: health HTTP 200/status UP; config JSON com /api; CSRF HTTP 200 sem divulgar token; auth/me HTTP 401 sem autenticação; navegação HTML em /, /anfitriao, /musico e /admin HTTP 200; arquivos do servidor HTTP 404. Login com credenciais e operação de sessão ficam para ensaio do responsável.

Nenhum commit ou push foi realizado. Ao final foi observado o commit local 4af0615 (Ajuste start server), criado pelo responsável com a correção. Garantir que esse commit esteja na main antes de novo deploy automático. O agente não realizou commit ou push.
