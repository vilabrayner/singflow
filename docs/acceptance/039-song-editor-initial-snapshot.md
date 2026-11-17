# Detalhes da música com carga única

## Comportamento

- Abrir a modal consulta `GET /api/admin/catalog/songs/{id}/details` uma vez.
- Resposta reúne música, cifra oficial e links/metadados de streaming em uma
  transação somente de leitura, com isolamento REPEATABLE_READ.
- A leitura não consulta APIs externas nem prepara enriquecimento.
- Cada aba é criada na primeira visita e preservada até fechar a modal.
- Alternar abas preserva links editados, listas, paginação e seleção, sem GETs
  nem máscara global. IDs e grupos de seleção são exclusivos por editor.
- Sem link, continuam disponíveis as sugestões preparadas e a busca sob demanda.
- Salvar mantém uma única transação para o rascunho, com proteção de versão.
- Reabrir busca o estado atual; erros na abertura não exibem um editor incompleto.
- Não há migration, commit ou deploy neste incremento.

## Validação

Backend e testes compilaram. O responsável executou
`./mvnw -B -Dtest=CanonicalMusicIntegrationTests test`: **BUILD SUCCESS**.
O novo cenário verifica resposta agregada, URLs, versão, referências vazias,
permissões administrativas e música excluída com PostgreSQL temporário.

Build final do frontend concluído. Os 46 cenários de interface das suítes de
editor, enriquecimento, cifra, streaming e gestão do catálogo foram validados em
desktop e mobile com API simulada: 44 passaram na rodada completa e os dois de
seleção do YouTube passaram na repetição após limitar a interação ao painel ativo.
Os testes verificam uma única leitura, ausência de loading nas trocas, referências
preservadas, rascunhos inválidos, conflito, sugestões/seleção retidas, reabertura com
dados novos e liberação da máscara após falha. `git diff --check` sem erros.

Para ensaio real, reiniciar o backend pela IDE e recarregar o frontend. Não há
migration nova. O build mantém avisos de orçamento de bundle/CSS e módulos
CommonJS do QR Code.
