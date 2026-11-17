# Música canônica, unificação e tons

Incremento autorizado em 16/11/2026. Regras em [ADR 005](../decisions/005-canonical-music-and-performance-keys.md).

## Preparação

O responsável reinicia backend e frontend pela IDE. O backend aplica a V19; não editar migrations anteriores nem executar repair. Não há novas variáveis de ambiente. Antes de produção, fazer backup e ensaio da migração em uma cópia: o esquema normalizado não é compatível com o backend antigo. Esta entrega não faz commit ou deploy.

## Ensaio integrado

1. Criar participante com música em texto livre. Conferir criação/vínculo provisório, pedir, convocar e concluir normalmente. Corrigir título e artista pelo admin: verificar novos valores no pedido, fila e histórico; dados anteriores permanecem na auditoria.
2. Unificar a música em cadastro aprovado. Conferir novo ID nos vínculos e novos nomes em todas as telas. A origem não deve aparecer em Todas nem nas pesquisas; seu nome antigo continua resolvendo para o destino. Conferir auditoria na música definitiva, contagem de apresentações e ordem da fila preservadas. Exclusão comum da música usada continua bloqueada.
3. No admin, cadastrar Tom original como D. No participante, abrir Configurar no SpeedDial de um pedido pendente: conferir zero padrão, carets, digitação e validação de inteiro (-24 a +24). Salvar -2.
4. No músico, conferir Tom: C para original D com ajuste -2; Tom: D (Original) para zero. Sem original, conferir Original para zero e +1/-2 para ajustes.
5. Convocar o pedido: configuração fica bloqueada. O músico registra o tom cantado como Bb, depois conclui-se a apresentação pelo anfitrião. Conferir tom cantado no histórico e possibilidade de corrigir esse registro. A solicitação e o original do catálogo não mudam.
6. Em sessão anterior, abrir histórico pelo seletor e registrar o tom cantado dentro da modal. Conferir que a gravação pertence à sessão consultada, mesmo se houver outra aberta. Músico sem vínculo ou com acesso revogado não pode gravar.
7. Trocar uma música pendente com ajuste: transposição volta a zero. Testar conflito entre duas configurações e entre configuração/convocação; tela mantém erro sem informar sucesso indevido. Unificação concorrente não deixa referências órfãs.

## Validação

Backend: a execução completa de 127 testes teve cinco erros em cenários antigos/preparação. Foram corrigidos; o responsável confirmou BUILD SUCCESS na repetição CanonicalMusicIntegrationTests/CatalogSyncIntegrationTests. Acrescentado teste de atualização V18 → V19 com unificações em cadeia e referências de sincronização convergentes; também confirmado BUILD SUCCESS pelo responsável. Total de 128 cenários validados entre as execuções.

68 testes de interface aprovados entre a regressão e a repetição focada, com API simulada em desktop/celular. Cobrem digitação/carets, conflitos, tom original no admin, histórico inclusive em sessão encerrada e permissões visuais. Build de produção, formatação e git diff --check aprovados. Permanecem os avisos existentes de orçamento do bundle/CSS e dependências CommonJS de QR Code. Ensaio integrado com serviços reais e teclado do celular permanece com o responsável.


## Regressão: tom original nos resultados da busca administrativa

A busca paginada do admin (`/api/admin/catalog/songs/search-page`) agora inclui
`originalKey` nos registros locais. Antes, a edição podia persistir o tom, mas
reabrir os detalhes a partir da busca deixava o campo vazio e um salvamento
posterior podia apagá-lo involuntariamente. Resultados externos continuam sem tom.

- `CatalogLookupTests`: 7 testes passaram, incluindo a preservação do tom e da versão.
- `CanonicalMusicIntegrationTests#keyOnlyEditRemainsVisibleInAdminSearchAndCanBeCleared`:
  `BUILD SUCCESS` informado pelo responsável na execução com PostgreSQL temporário.
- Conferência manual: buscar uma música, alterar somente o tom, salvar e reabrir
  pela mesma busca; conferir o valor. Limpar o campo e salvar deve remover o tom.
- Não há migration nova ou alteração nos fluxos de cifra e streaming.
