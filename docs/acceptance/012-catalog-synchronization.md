# Sincronização das músicas provisórias

Incremento autorizado e implementado em 12/11/2026. A sincronização usa a API oficial `track.search` do Last.fm; não raspa páginas. Início exclusivamente por administrador ativo.

## Uso

1. Reinicie o backend pela IDE para o Flyway aplicar a **V15**. Nenhuma migration anterior deve ser editada ou reparada.
2. Confirme `LASTFM_API_KEY` no ambiente do backend. Não há variável obrigatória nova.
3. Acesse **Admin → Catálogo → Sincronizar provisórias**.
4. Clique **Iniciar sincronização** e confirme. O lote captura apenas os cadastros PENDING presentes naquele momento; não inclui novas músicas cadastradas durante o processamento.
5. Acompanhe processadas/total, aprovadas automaticamente, revisadas pelo admin, aguardando revisão e falhas. **Atividade** mostra resultados recentes; **Precisam de revisão** agrupa os casos que exigem intervenção. As listas são paginadas em 20 itens.
6. Pause/retome pelos botões. Feche a tela e volte para conferir a continuidade e o progresso salvo. Quando houver mais de um lote, o seletor oferece os últimos 20, com data e situação.
7. Abra uma música de revisão. Escolha uma das até dez correspondências, ou preencha título e artista manualmente. **Revisar alteração** mostra dados atuais e propostos antes de qualquer aprovação.
8. Caso já exista cadastro correspondente no SingFlow, a confirmação muda para **Vincular e aprovar**, exibindo o destino. Esse destino pode estar provisório ou aprovado; cadastro rejeitado exige revisão prévia na gestão normal do catálogo.
9. **Deixar para depois** fecha a revisão sem alterar a música. **Opções da revisão → Consultar dados salvos** agenda nova consulta, respeitando o lote ativo e a versão atual.

## Critérios

Aprovação automática exige artista preenchido, título e artista iguais após normalização Unicode NFC, caixa e espaços, uma única correspondência exata e ausência de outro cadastro canônico para o resultado. Não são removidos acentos, pontuação, participações ou termos de versão como “ao vivo” e “acústico”. Resultados ambíguos não são aprovados automaticamente.

Artista ausente, diferenças ou resultados ambíguos sempre exigem escolha humana. Sem resultados, o admin pode corrigir e aprovar manualmente (título e artista obrigatórios). Falha de consulta não significa ausência de música: ela é tratada separadamente, sem aprovação falsa.

O provedor é consultado por título/artista, com nova busca apenas pelo título quando não houver correspondência exata na busca restrita. Ordenação aproximada serve apenas para apresentar alternativas; não autoriza aprovação automática. Títulos curtos também podem ser consultados neste processamento; o autocomplete público mantém seu mínimo de três caracteres.

## Persistência, autorização e retomada

A V15 acrescenta referências Last.fm (URL/MBID), lotes, itens, candidatos e auditoria. Cada item guarda o snapshot e a versão da música consultada. Alterações externas são preservadas e sinalizadas; antes da aprovação ou vínculo, a versão da música e a revisão do resultado são conferidas novamente.

Há somente um lote RUNNING/PAUSED por vez. O processamento ocorre no backend, sem depender das consultas da tela, em rodadas com intervalo de dois segundos. Rede externa fica fora da transação. Claims têm token único e lease de dois minutos; após interrupção, outro ciclo pode retomar o item vencido. Resultados antigos não podem ser aplicados por um token substituído.

Retentativas de consulta são limitadas a três. Espera inicial de 30 segundos em falhas e 90 segundos em limite de chamadas. O limite global e cache do cliente Last.fm continuam compartilhados com a busca. Pausar impede aplicação de resultados automáticos em andamento; alterações ficam pendentes para retomada. Se quem iniciou/retomou perder aprovação ou permissão admin, o lote é pausado e outro admin pode retomar.

O progresso é preservado durante reinícios, mas o processamento só avança enquanto o backend estiver executando. Suspensão da hospedagem interrompe temporariamente as consultas, sem apagar o estado; ao voltar, os itens são retomados pelo controle persistente.

No frontend, consultas REST a cada dois segundos enquanto a página está visível. Sair da tela interrompe apenas esse acompanhamento. O polling não substitui os campos de uma revisão em edição. Falhas e revogação de autorização recebem tratamento visual, sem expor dados privados após perda de acesso.

A auditoria do catálogo registra aprovação automática, aprovação assistida/manual ou vínculo, com ator e estados anterior/posterior. O lote mantém quem iniciou e quem o retomou, além de eventos de controle. Referências do Last.fm aceitam somente URLs do domínio oficial em HTTPS e identificadores validados. Chave e respostas técnicas do provedor não são expostas em erros.

Para testes automatizados, `SINGFLOW_CATALOG_SYNC_ENABLED=false` desativa o agendamento; os testes dirigem claims e resultados sem consultas reais. Em execução normal o agendamento está habilitado, mas nenhum lote é criado automaticamente.

## Validação

- Build backend e 35 testes sem banco aprovados, incluindo correspondência conservadora, referências seguras, artista, títulos curtos, cache e limites do provedor.
- Responsável informou **BUILD SUCCESS** em `./mvnw -B verify`, incluindo V15 e testes com PostgreSQL temporário: idempotência de início, somente provisórias, aprovação exata, escolha explícita, vínculo com destino versionado, revisão concorrente, pausa, lease vencido, preservação de edições, retentativas limitadas e revogação administrativa.
- Build frontend aprovado; avisos preexistentes de orçamento inicial e CommonJS preservados.
- **110 testes de interface aprovados** em desktop/mobile com API simulada. Oito novos testes cobrem progresso, pausa/retomada, reabertura, comparação antes/depois, vínculo explícito, revisão manual sem perda de edição, conflito e retentativa.
- Ensaio integrado real pelo responsável pendente.

Nenhum serviço foi iniciado ou encerrado automaticamente. Sem deploy, commit ou mudança de regras da fila. WebSocket permanece separado deste incremento.

## Busca refinada dentro da revisão — 12/11/2026

A opção **Refinar busca** abre título e artista dentro da mesma modal. **Buscar novamente no Last.fm** consulta os valores digitados (artista opcional para pesquisar). A consulta usa a API compartilhada do backend, sem nova chave ou migration. Não usa o lote nem os dados antigos salvos como parâmetros; não há fallback para artista diferente nesta busca refinada.

As até dez correspondências retornadas substituem as anteriores apenas após uma consulta bem-sucedida. A revisão recebe nova versão, invalida escolhas antigas e registra QUERY_REFINED na auditoria da sincronização. Os campos digitados permanecem na tela. Nenhum título, artista ou aprovação do catálogo é gravado nesse momento, mesmo em correspondência exata. A versão e a situação da música são verificadas antes e depois da rede externa; edições concorrentes impedem a substituição.

Falha de API mantém os resultados anteriores e o rascunho, com mensagem de erro. Resposta vazia limpa as opções e permite **Usar dados manuais**; título e artista continuam obrigatórios para aprovação manual. Seleção ou texto manual passam pela comparação atual/proposto e confirmação existente. O vínculo de duplicatas continua explícito.

A opção **Consultar dados salvos** no menu continua sendo a retentativa do lote com o cadastro persistido. A nova busca pelo formulário não salva o rascunho no catálogo nem agenda aprovação automática.

Validação: builds frontend/backend e 38 testes sem banco aprovados; 12 testes de interface em desktop/mobile aprovados, incluindo parâmetros editados, substituição das sugestões, confirmação explícita, preservação em falha e opção manual sem resultados. Testes novos com PostgreSQL preparados e `./mvnw -B verify` solicitado ao responsável.

### Correção da exibição após aprovação

A lista de atividade passa a mostrar título/artista atuais do catálogo canônico para itens AUTO_APPROVED, APPROVED e MERGED. A consulta acompanha inclusive o destino de uma unificação. Itens pendentes continuam mostrando o snapshot consultado; o snapshot original permanece salvo e disponível na revisão/auditoria. Não há migration nova. Foram acrescentados testes com PostgreSQL para aprovação com correção de metadados e vínculo a cadastro existente. Os 38 testes sem banco passaram; verificação específica com banco solicitada ao responsável.

O responsável também informou BUILD SUCCESS na verificação completa da busca refinada descrita acima.

### Conclusão e aviso de saída

Ao terminar o processamento e resolver todas as músicas provisórias do lote acompanhado, a tela retorna automaticamente ao catálogo e emite toast **info**: “Sincronização finalizada com sucesso”. A aprovação individual final não gera uma segunda notificação redundante. Consultar um lote histórico já concluído continua permitido, sem redirecionamento imediato.

Ao sair pelo botão Voltar ou trocar de aba com músicas do lote ainda provisórias, emite toast **warn**: “Existem músicas pendentes de revisão”. O aviso não interrompe o worker. O cálculo usa os cadastros canônicos atuais, incluindo músicas alteradas fora da sincronização, e não apenas a quantidade de itens na lista de revisão; falhas e consultas pendentes não provocam conclusão prematura. Não há migration nova.

Validação desta evolução: builds frontend/backend, 38 testes sem banco e 20 testes de interface desktop/mobile aprovados. Responsável informou BUILD SUCCESS no teste específico `CatalogSyncIntegrationTests` com PostgreSQL temporário. O mesmo teste também confirmou anteriormente a correção dos títulos e artistas na lista após aprovação/vínculo.
