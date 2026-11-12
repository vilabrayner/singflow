# Catálogo SingFlow — primeiro incremento

Autorizado em conversa e implementado em 12/11/2026. Catálogo único, gestão pelo admin, cadastros provisórios sem impedir pedidos ou apresentações. Regras de fila preservadas: frequência, associação e aprovação do catálogo não concedem prioridade.

## Entrega

- Nova área **Admin → Catálogo**, com busca por título/artista, filtros e paginação de 25 registros.
- Cadastro administrativo aprovado; novos títulos provenientes de pedidos ou convocações entram como provisórios.
- Correção de título/artista, aprovação, rejeição com motivo, unificação em um cadastro aprovado e histórico das últimas 50 alterações.
- Menus flutuantes para ações extras e confirmações na mesma modal, com retorno aos detalhes e foco por teclado.
- Busca pública oferece primeiro músicas aprovadas do SingFlow e complementa pelo Last.fm. Mantidos 3 caracteres, 400 ms e até 10 resultados; opções identificam a origem. Se o Last.fm falhar, resultados locais continuam disponíveis. Texto livre segue permitido.
- Selecionar uma música não cria registros por si só. O cadastro provisório nasce quando o pedido ou a convocação são gravados. Buscar nunca popula o banco com resultados não escolhidos.
- Campos de links Spotify, YouTube, letra e cifra reservados no banco para a próxima evolução; sua edição ainda não está disponível.

## Persistência e concorrência

A V14 cria `catalog_songs`, aliases normalizados e auditoria. Vincula os pedidos e convocações existentes, agrupando apenas título e artista iguais após normalização de caixa e espaços. Acentos, artistas e versões diferentes não são inferidos como equivalentes. Entradas importadas são provisórias e registram origem LEGACY.

Pedidos e convocações mantêm UUIDs, situações e seus textos históricos. Unificar cria um redirecionamento da entrada original; os nomes antigos continuam encontrando a música canônica. `singflow.catalog_root(catalog_song_id)` permite agrupar os vínculos históricos em estatísticas futuras. Correções e unificações não reescrevem o repertório que foi pedido ou cantado.

As escritas do catálogo usam bloqueio transacional comum e versões para detectar revisão concorrente. O bloqueio não inclui rede externa. A administração não bloqueia nem altera linhas de sessões/pedidos durante a unificação, evitando inversão de bloqueios com a operação do palco. A fila continua exigindo seus bloqueios existentes.

A auditoria do catálogo guarda ator, motivo, estado anterior e posterior. Não há exclusão física nem reabertura automática de sessão. Catálogo rejeitado não bloqueia pedidos existentes nem o envio em texto livre. A consulta pública local só retorna APPROVED; o Last.fm continua sendo fonte externa de descoberta, sujeito à criação provisória no envio.

## Execução e ensaio

Nenhuma variável nova. `LASTFM_API_KEY` continua somente no backend; não é necessária para buscar músicas locais aprovadas. Após reiniciar o backend pela IDE, o Flyway aplica a V14. Não executar repair nem editar migrations anteriores.

1. Entre como admin e abra **Catálogo**. Confira as músicas históricas em **Provisórias**.
2. Abra uma entrada, corrija título/artista e salve. Reabra e aprove pelo menu.
3. Pesquise a música como anfitrião ou participante; a opção SingFlow deve preceder os resultados externos. Cadastre um pedido e confira a fila normal.
4. Envie texto livre novo; a música deve aparecer como provisória sem impedir a chamada ou conclusão.
5. Crie uma música pelo admin e confira o filtro **Aprovadas**.
6. Abra uma duplicata provisória, escolha **Unificar duplicata**, busque o cadastro aprovado de destino e informe motivo. Confirme a unificação.
7. Confira o filtro **Unificadas** e o histórico da entrada original. Pedidos e apresentações antigos devem manter os textos originais.
8. Rejeite uma entrada com motivo. Ela não deve ser oferecida pelo catálogo local; pedidos já existentes continuam operáveis.
9. Verifique que anfitrião e músico comuns não têm acesso à administração do catálogo.

## Verificação

27 testes sem banco aprovados. O responsável executou `./mvnw -B verify` e informou **BUILD SUCCESS**, incluindo atualização V13 → V14 com dados legados, vínculo de pedidos/apresentações, auditoria, revisão concorrente, permissões e preservação de snapshots. Build frontend aprovado, com avisos preexistentes de orçamento e CommonJS. 102 testes de interface aprovados na regressão final com API simulada, em desktop/mobile. O cenário de teclado também passou em seis repetições após corrigir uma espera do próprio teste. Ensaio integrado pelo responsável pendente.

## Próximas etapas separadas

Links de repertório, rankings de músicas, recomendações, contas opcionais de participantes e histórico entre eventos. Nenhuma prioridade por assiduidade; benefícios futuros não alteram a isonomia da fila. WebSocket não integra este incremento.

Ajuste de navegação: ao entrar no catálogo, o filtro inicial é **Todas**. A sincronização continua selecionando apenas PENDING no backend, independentemente do filtro da lista. A seleção de músicas pelo participante será tratada em incremento próprio, preservando as permissões públicas do catálogo.

Evolução posterior: o [Aceite 013](013-participant-song-choices.md) substitui a criação provisória para resultados Last.fm selecionados e comprovados pelo backend: esses registros entram aprovados. Texto livre permanece provisório. Também entrega a seleção pública de músicas no painel do participante.
