# SingFlow 0.1.0-beta.3

Preparada localmente em 18/11/2026. O responsável fará commit, merge e push na main.
Não foram criados tag, release, imagens ou implantação durante esta preparação.

## Alterações desde a beta.2

- Painel público `/tv/<sessão>`, com atualização por WebSocket e isolamento entre
  sessões simultâneas. Habilitação explícita pelo anfitrião.
- Admin cadastra locais (nome, marca, fundo de TV) e projetos de karaokê
  (nome, marca, Instagram opcional). O anfitrião escolhe ambos ao abrir a sessão.
- TV com layout em L: topo 1600 × 300 e lateral esquerda 400 × 1080 na referência
  Full HD. Dados da apresentação no topo, QRs à esquerda, assinatura SingFlow no
  rodapé. Arte de chamada “Próximo no Palco”, tipografia ampliada e legendas limpas.
- Fundo de exemplo do Café Tão em `frontend/public/tv/cafe-tao-background-l-v1.png`;
  fundos continuam configurados por local. A segunda proposta artística permanece
  fora do app até escolha/upload pelo responsável.
- PWA com instalação orientada, ícones 192/512, conectividade, página offline e
  atualização com confirmação, usando o mesmo worker das notificações.
- Cache offline restrito à página genérica e logo: não armazena páginas autenticadas,
  APIs ou fila e não executa ações offline.
- V23 preservada com checksum aplicado; evolução em V24. Dados legados mantidos;
  TVs antigas precisam de seleção explícita de local/projeto para reativação.

Detalhes: [guia TV/PWA](../television-pwa.md), [padrão visual](../ui/screen-pattern.md).

## Validação e pendências

- Backend: 245 dos 246 testes passaram na execução completa informada pelo
  responsável. O único erro era um `created_at` ausente na preparação do teste;
  após correção, o cenário V23 → V24 passou na repetição focada pela IDE.
- Frontend: build de produção aprovado; regressão crítica com 38 testes,
  configuração/service worker com 26 testes e repetição dos fluxos de abertura/PWA
  com 30 testes aprovados. Após refinamentos visuais, quatro testes da TV passaram.
- Layout da TV aprovado pelo responsável. Instalação PWA e atualização em app
  instalado ainda precisam de aceite em HTTPS em Android/iPhone; emulação e testes
  automatizados não substituem essa conferência. Leitura dos QRs em TV real pendente.
- WhatsApp real e Web Push publicado continuam sujeitos à configuração e ao aceite
  dos canais; esta versão não confirma envio de mensagens em produção.

## Preparação e publicação

A versão é igual em `frontend/package.json`, nas duas entradas do package-lock
e no `backend/pom.xml`. Menus e `version.json` recebem a versão pelo build;
não editar manualmente arquivos gerados em dist ou public/version.json.

1. Incluir no commit os arquivos novos de TV, branding, PWA, imagens, migrations,
   testes e documentação. Não incluir `.env`, credenciais, dist ou recibos fictícios.
2. Fazer merge e push; obter o SHA completo da **main após o merge**.
3. No build sob demanda, usar `EXPECTED_VERSION=0.1.0-beta.3` e `SOURCE_REVISION`
   igual ao SHA escolhido. Não reutilizar o SHA da branch antes do merge.
4. Após sucesso, conferir que `release.published.json` contém beta.3 e o SHA exato.
   Criar `v0.1.0-beta.3`/prerelease somente com o recibo verificado, usando o script
   existente `scripts/aws/github-release.py --manifest <recibo>`.
5. Implantação na EC2 é etapa separada, com backup e janela sem sessão em uso.
   Não mover tags existentes nem reutilizar uma versão publicada para outro commit.

O [roteiro anterior](release-0.1.0-beta.2.md) documenta a operação manual existente;
ao segui-lo, substituir a versão, os nomes de arquivos e o recibo por beta.3. Não
executar repair do Flyway: a atualização deve aplicar V23/V24 preservadas. Conferir
saúde, versão nos menus, TV por sessão, WebSocket e PWA após publicação.
