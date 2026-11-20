# Perfis acumuláveis, catálogo contextual e referências automáticas

Incremento autorizado em 19/11/2026, posterior à publicação da beta.3 confirmada
pelo responsável. Implementação local; não publicado por este trabalho.

## Uma conta, vários contextos

O perfil original (`role`) e a senha são preservados. A V25 cria `account_profiles`
para os perfis adicionais HOST, MUSICIAN e PARTICIPANT. As funções SQL
`account_roles` e `has_account_role` incluem o perfil original, inclusive em contas
antigas e novas inscrições. Não é necessário duplicar e-mail, conta ou senha.

Admin → Cadastros → detalhes de uma conta ativa → Perfis da conta → Salvar perfis.
O perfil original não pode ser desmarcado; perfis adicionais podem ser concedidos
e retirados. A conta precisa estar aprovada e com e-mail confirmado. O endpoint
`POST /api/admin/accounts/profiles` valida admin ativo no banco, CSRF e versão,
registra `PROFILES_CHANGED` na auditoria e publica alteração da conta.

Administrador continua sendo uma permissão adicional protegida (`administrator`),
não um valor aceito nesse endpoint. Não há autoatribuição de privilégios nem
promoção administrativa pela edição de perfis. A configuração administrativa
existente é preservada. Um admin pode associar MUSICIAN à própria conta ativa.

Cada requisição protegida atualiza as permissões da sessão autenticada consultando
o banco. Retirar perfil não exige novo login para bloquear uma operação. O estado
de contas suspensas e o acesso WebSocket continuam sendo conferidos.

Os menus de header de anfitrião, músico e admin compartilham `PanelSwitcher`.
A opção Alternar painel usa os dados da leitura de conta já existente, sem nova
consulta por menu. O preview do músico para anfitrião permanece disponível; isso
não autoriza registrar tom ou cifra pessoal sem perfil MUSICIAN. Anfitrião comum
continua gerenciando somente suas sessões; músico comum depende da concessão.
Contas com ambos os perfis veem a união sem duplicatas de sessões próprias e
sessões concedidas. Admin mantém sua permissão global de gestão.

## Edição no contexto do músico

Com permissão de admin, o título da música no palco, fila e histórico abre o
mesmo componente `AdminCatalog` em modo `editorOnly`. Não carrega a listagem do
catálogo e não navega para o painel administrativo. Dados, Cifra, Spotify, YouTube,
salvamento único, conflitos e validações são compartilhados com o admin.

O modo de editor é só uma apresentação: todas as leituras/gravações continuam
nos endpoints administrativos protegidos. Músico sem admin não vê o comando e
não consegue editar o catálogo chamando o endpoint diretamente. Cifra pessoal
e tom cantado permanecem funções separadas das referências oficiais.

Salvar mantém a aba do músico e atualiza seu snapshot. Alterações do catálogo e
vínculos automáticos geram invalidação das sessões abertas que usam a música,
somente após commit. Nenhum conteúdo de catálogo ou credencial vai no frame.

## Referências automáticas sem novas consultas desnecessárias

Música criada por um pedido agenda o enriquecimento existente. Para cifra,
Spotify e YouTube, o primeiro resultado é validado pelo adaptador do provedor e
vinculado como referência do catálogo, com auditoria `RESOURCE_AUTO_LINKED` e
ator `system:enrichment`. A ordem é a retornada pelo provedor, não uma ordenação
local por reproduções. Não é uma garantia de versão musical correta; o admin
pode corrigir pontualmente, inclusive no painel do músico.

Links existentes e preferências pessoais nunca são substituídos. Metadados
alterados, unificação, exclusão, claims vencidos e respostas concorrentes são
conferidos antes de gravar. Sem artista, aguarda metadados. Falha ou ausência
de resultado não impede o pedido e mantém a edição/pesquisa manual.

Sugestões READY de versões anteriores são aproveitadas no banco pelo worker,
sem refazer a consulta externa. O processamento depende das flags existentes
`SINGFLOW_ENRICHMENT_ENABLED` e `SINGFLOW_ENRICHMENT_WORKER_ENABLED`. Não há nova
credencial nem novo serviço. Letra continua somente em cache por sessão.

## Retorno à lista do admin

Salvar atualiza o item na lista já carregada, preservando busca, filtro, cursor
de paginação e posição da scrollarea. Não chama novamente a primeira página.
Unificação deduplica o registro definitivo; filtro de situação é respeitado.
Fechar a modal restaura foco sem deslocar a rolagem. O botão Atualizar continua
disponível quando o usuário quiser refazer a listagem.

## Verificações

Backend/testes compilaram e 12 testes focados sem banco passaram. O responsável
executou `./mvnw -B verify` pela IDE e informou BUILD SUCCESS, validando a V25 e
os cenários com PostgreSQL temporário e APIs simuladas. Na interface, passaram
16 testes focados (desktop/celular) e a regressão crítica de 41 testes. Os 26
cenários de configuração/service worker também passaram. Build de produção
aprovado; não houve consultas reais aos provedores nesses testes.

O teste de retorno à lista carrega 30 músicas em três páginas, edita um item
intermediário e confere que lista, número de leituras e scrollTop são preservados.
A posição é capturada desde o toque de abertura; a modal restaura o foco sem
rolar a listagem. Os cenários de perfis incluem concessão, revogação, versão,
proibição de autoelevação administrativa e preservação de sessões próprias.

Sem commit, push, tag, build remoto ou deploy. Migrations V1–V24 preservadas.
