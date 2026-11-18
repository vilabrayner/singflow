# TV por sessão e PWA

Implementação local de 18/11/2026. Este documento não confirma publicação na AWS.

## Como usar

1. Admin → Locais e projetos. Cadastre um local com **nome, marca e fundo de TV**.
2. Cadastre um projeto com nome, marca e Instagram opcional, sem `@`. Para o Som
   Na Caixa, use `karaoke.somnacaixa` se quiser exibir o QR do perfil.
3. Anfitrião → abrir sessão. Selecione local e projeto, disponíveis a todos os
   anfitriões. A opção de TV é explícita; abertura e seleção são uma operação atômica.
4. No menu da sessão no header, use Tela TV para configurar/habilitar e abrir ou
   copiar `/tv/<UUID da sessão>`. Cada sessão possui seu próprio endereço.
5. Para antecipar a tela “Logo mais…”, configure e habilite a TV da sessão ainda
   em preparação pelo menu do header. Abrir a sessão muda o conteúdo automaticamente.

O layout usa uma referência Full HD: faixa superior de 1600 × 300 px para a
participação e faixa esquerda de 400 × 1080 px para os QRs menores, com canto
superior compartilhado. Abaixo do topo, os QRs ficam na lateral esquerda. As marcas do local e do
projeto não são repetidas nas faixas; somente a assinatura SingFlow permanece
no rodapé esquerdo. O conjunto mantém proporção 16:9, com barras de
respiro quando a tela tem outra proporção. A arte de fundo pode conter as marcas originais. O fundo é preservado inteiro, sem recorte. Antes da abertura não
há QR de inscrição; ao encerrar, participante e QR de entrada desaparecem.
A convocação ativa tem preferência; sem convocação, aparece o primeiro da fila.
Desconexão esconde a indicação de participante/QR para evitar chamada desatualizada.
Tela cheia depende do suporte e da ação do usuário no navegador.

## Imagens e dados

Uploads administrativos aceitam PNG/JPEG até 6 MiB, validam o conteúdo e removem
metadados por recodificação. Logos são reduzidas até 1024 px; fundos até 1920 px,
preservando proporções. Limites adicionais: 8192 px por lado, 24 milhões de pixels
e 2 MiB no arquivo resultante. Assets imutáveis são deduplicados por hash e
armazenados no PostgreSQL; URLs públicas recebem cache e ETag. Não há novo bucket.
Ao atualizar uma marca compartilhada, as TVs vinculadas recebem invalidação.

TV é pública somente quando habilitada; revela nome informado, música/artista e
a identidade presente na arte selecionada. Não retorna telefone, e-mail, credenciais, mesa ou histórico.
O QR geral permite inscrição, assim como o QR já existente no anfitrião. Não expor
QR individual de recuperação em TV. Tickets WebSocket têm escopo de uma sessão,
uso único e proteção CSRF; desabilitar/encerrar revoga o acompanhamento.

## Migrações

V23 foi preservada exatamente com checksum `712909785`. V24 acrescenta cadastros
compartilhados e vínculos, preservando os campos antigos. TVs legadas habilitadas
ficam desabilitadas até seleção explícita de local/projeto. Não executar `repair`,
apagar histórico Flyway ou editar migrations aplicadas para essa atualização.

## PWA

Instalar SingFlow está disponível na home e na conta do participante. Android pode
oferecer o prompt nativo; iPhone recebe instruções para adicionar à Tela de Início.
HTTPS é necessário no ambiente publicado; localhost serve para teste no computador.
O cadastro e as permissões de notificação continuam opcionais e independentes.

Manifest usa ícones 192/512 px. O worker compartilhado `/notifications-sw.js`
continua atendendo push. Só mantém a página genérica `/offline.html` e a logo
pública em cache; não guarda HTML autenticado, APIs, letras ou fila. Sem internet,
não aceita pedidos nem confirma convocações. A fila sempre depende do servidor.

`version.json` é gerado da versão do package no prestart/prebuild e entregue sem
cache. Verificação ocorre no início e ao voltar à tela, limitada a uma por minuto,
sem polling contínuo. Nova versão oferece confirmação antes de recarregar; instalar
worker novo não força recarga nem troca automática durante um formulário.

## Validação e aceite

- Backend: execução completa de 246 testes com 245 aprovados e um erro de fixture;
  corrigido `created_at`, o teste focado V23 → V24 passou na IDE do responsável.
  Migrations e comportamento de produção não mudaram nessa correção.
- Build de produção e formatação aprovados; 38 testes da regressão crítica e
  26 testes de configuração/service worker passaram.
- Testes de navegador com API simulada cobrem cadastro de marcas, abertura,
  duas sessões isoladas, estados da TV e atualização do PWA com formulário aberto.
- Testes do worker verificam cache restrito, fallback offline, atualização explícita
  e preservação da revalidação dos avisos push.

Aceite físico pendente: instalar Android/iPhone por HTTPS; fechar/reabrir e retomar
conta; testar atualização com formulário aberto; desligar/religar rede; ler QR na TV
à distância; abrir duas TVs simultâneas; chamar/concluir/encerrar e desabilitar TV.
Os previews usam a arte fornecida e dados simulados, sem cadastrar registros reais.

Não houve commit, push, build remoto ou deploy como parte deste incremento.


### Layout em L e arte do Café Tão

A reformulação substitui as duas faixas laterais. A assinatura SingFlow permanece
no rodapé esquerdo; os QRs ocupam a lateral abaixo da faixa superior. Em telas
que não são 16:9, a composição é centralizada inteira, sem esticar ou recortar.

A arte de exemplo está em `frontend/public/tv/cafe-tao-background-l-v1.png`.
Para aplicar a um local já cadastrado, envie esse arquivo no campo Fundo de TV
do admin. O app continua respeitando o fundo escolhido para cada local; não há
troca automática de registros ou fundo global do Café Tão para outras casas.
