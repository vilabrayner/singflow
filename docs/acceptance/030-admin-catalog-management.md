# Gestão do catálogo administrativo

Implementação de 16/11/2026. Complementa e substitui o comportamento de conclusão de sincronização do aceite 029.

## Preparação

O responsável reinicia o backend pela IDE para aplicar a V18 e usa o frontend atualizado. Não editar migrations anteriores nem executar repair para este incremento. Não há novas variáveis de ambiente. Last.fm continua configurado no backend.

## Ensaio

1. Abrir Admin → Catálogo em desktop e celular. Conferir Todas por padrão, título/artista sem tag na lista e ícones de informação e exclusão à direita. Situação e ações administrativas permanecem no diálogo de informação.
2. Carregar mais: acrescentar dez itens sem apagar os anteriores. Em falha de rede, manter a lista e permitir tentar novamente. Conferir busca fixa e rolagem somente na lista.
3. Digitar menos de três caracteres: não pesquisar remotamente. A partir de três, aguardar a pesquisa automática; conferir resultados locais e complemento da Internet. Selecionar um resultado externo: cadastrar automaticamente, mostrar sucesso e permitir abrir seus detalhes. Reenvio após resposta perdida não duplica a inclusão.
4. Cancelar uma exclusão: nenhuma alteração. Confirmar a exclusão de música sem uso: ela desaparece das pesquisas, com auditoria preservada. Reenviar um cadastro antigo dessa música não deve informar sucesso.
5. Tentar excluir música com pedido, inclusive cancelado, apresentação, item de sincronização ou unificação em qualquer direção: bloquear com conflito e preservar o item. Não remover associações para permitir excluir. Aliases, auditoria e registros técnicos da própria inclusão não representam uso por outra entidade.
6. Abrir Sincronizar: exibir somente itens que precisam de intervenção. Aprovados automaticamente não aparecem na lista. Conferir pausa/retomada, nova pesquisa, revisão, aprovação e vínculo existentes.
7. Resolver a última pendência: mostrar “Sincronização finalizada com sucesso”, limpar progresso/lista/detalhes e permitir nova execução, permanecendo em Sincronizar. O histórico persistente permanece no banco. Sair antes de resolver tudo mantém o aviso de pendências.

## Validação

Build de produção, formatação e 62 testes de interface aprovados em desktop/celular, com API simulada. A execução completa do backend teve 121 testes e uma única falha: a contagem esperada de migrations ainda era 17. A expectativa foi corrigida para 18 e o responsável confirmou BUILD SUCCESS na repetição focada de migratesRealPostgres.

Depois dessa execução, foi acrescentada a proteção contra reenvio de cadastro após exclusão. Código e testes compilam; o responsável confirmou BUILD SUCCESS na repetição focada de CatalogManagementIntegrationTests, validando também essa última proteção com PostgreSQL temporário. Ensaio integrado e em aparelho físico permanece com o responsável. Não houve commit ou deploy.
