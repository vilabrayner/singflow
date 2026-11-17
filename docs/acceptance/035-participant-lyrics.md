# Aceite 035 — Letras do participante

## Preparação

Reiniciar o backend pela IDE para carregar o novo adaptador; frontend atualizado. Não é necessária chave ou migration. Opções de backend no `.env.example` e Compose: `SINGFLOW_LYRICS_ENABLED=true` e `SINGFLOW_LYRICS_CLIENT="SingFlow/0.1 (https://singflow.flowave.tec.br)"`. Sem commit, push ou deploy.

## Roteiro

1. Participante com nome, título e artista corretos entra na sessão. Na espera, ainda sem convocação, não deve haver busca disparada por este participante.
2. Anfitrião chama: a consulta é agendada em segundo plano após a confirmação ser gravada. Participante confirma a ida. O card de status mostra carregamento e depois letra simples, com quebras de linha, rolagem manual e crédito LRCLIB. Exemplo de ensaio real: Giz — Legião Urbana.
3. Atualizar o painel: mesma convocação mantém a letra/rolagem e não dispara uma nova consulta automaticamente.
4. Anfitrião conclui: o painel retorna à fila e a letra desaparece. Se concluir enquanto a consulta ainda estiver carregando, o retorno tardio não deve reaparecer.
5. Sem artista, letra não encontrada ou registro instrumental: conferir mensagem correspondente. Em indisponibilidade, usar Tentar carregar novamente sem perder o estado da participação.
6. Conferir pelo celular que o texto acompanha a rolagem interna, não causa rolagem horizontal e que header/dock permanecem no padrão.
7. Confirmar o fluxo anterior: anfitrião conclui uma convocação mesmo sem o participante confirmar ida; a tela deve voltar à fila normalmente.

## Validação

Compilação e sete testes focados sem banco passaram. Build do frontend aprovado; 32 cenários de interface com API simulada passaram em desktop/celular. Dois cenários adicionais conferem a conclusão sem aceite. Fixtures de letras são textos sintéticos de teste, sem músicas reais. A prova de cobertura externa encontrou letras para Giz/Legião Urbana, Like a Prayer/Madonna e The Scientist/Coldplay.

Solicitada ao responsável a execução `./mvnw -B -Dtest=AudienceLyricsIntegrationTests test`: valida credencial, titularidade, aceite, revogação, resposta no-store, revalidação após consulta e ausência de transação durante a chamada externa em PostgreSQL temporário. Resultado ainda pendente neste registro; ensaio integrado/físico fica com o responsável.


## Ensaio da antecipação

Reiniciar o backend pela IDE. `SINGFLOW_LYRICS_PREFETCH_ENABLED=true` é o padrão; false preserva o comportamento de consulta apenas sob demanda. No Compose, a variável é encaminhada ao backend.

1. Chamar uma música ainda não consultada e verificar que o painel do anfitrião responde normalmente.
2. Após alguns segundos, confirmar a ida no participante: a letra deve ser reutilizada do cache quando a busca antecipada já tiver terminado.
3. Repetir a mesma música em outra apresentação: deve reutilizar o cache enquanto válido.
4. Simular provedor lento/indisponível: a chamada deve continuar registrada e a tela deve manter carregamento/erro com tentativa manual, conforme o caso.
5. Cancelar/concluir enquanto a busca ocorre: nenhuma letra deve reaparecer para uma convocação antiga.

Validação sem banco: 18 testes focados passaram, incluindo consulta assíncrona, deduplicação, fila cheia, falha, cache imediato e busca compartilhada. Compilação passou. Solicitado `./mvnw -B verify` ao responsável para cobrir conjuntamente a validação anterior de letras e os novos cenários de antecipação com banco; resultado ainda pendente neste registro.


Validação consolidada em 16/11/2026: o responsável executou a verificação completa após a V21 com BUILD SUCCESS, concluindo também os testes de letras e antecipação anteriormente pendentes. O cenário de esquecer acesso respeita agora a ordem de concluir a apresentação, sair da fila e esquecer o acesso. A regra de bloqueio não foi modificada.


## Ensaio de retenção por sessão

A letra encontrada não expira mais em dez minutos enquanto uma sessão consumidora estiver aberta. Reiniciar o backend pela IDE para carregar a nova política; nenhuma migration é necessária.

1. Confirmar ida de um participante e carregar a letra. Concluir e chamar a mesma música novamente na sessão: deve reutilizar a letra mesmo após dez minutos.
2. Concluir a apresentação e encerrar a sessão. Criar/abrir outra e repetir a música: deve ocorrer nova busca.
3. Com duas sessões abertas consumindo a mesma letra, encerrar uma delas: a outra deve continuar reutilizando a entrada. A última a encerrar libera o texto.
4. Tentar encerrar com convocação ativa (operação bloqueada): o cache da sessão deve permanecer.
5. Encerrar enquanto uma busca antecipada estiver em andamento: o retorno tardio não pode recriar a entrada da sessão encerrada.

Vinte e dois testes focados sem banco passaram, incluindo retenção além do TTL antigo, compartilhamento, encerramento em consulta, consulta tardia e resultados vazios. Solicitada a execução focada de `AudienceLyricsIntegrationTests`, `CallLyricsPreparationIntegrationTests` e `CatalogEnrichmentIntegrationTests` ao responsável para validação com PostgreSQL temporário; resultado pendente neste registro.


A repetição focada do cache revelou interferência entre métodos de teste: o contexto Spring mantinha as letras em memória enquanto o mock do provedor era reiniciado. A fixture agora libera, em AfterEach, somente as sessões criadas pelo próprio teste, incluindo sessões auxiliares. Isso mantém o compartilhamento real entre sessões e permite que o cenário de conclusão durante consulta exercite efetivamente o provedor/revalidação. Código de produção e expectativa HTTP 409 preservados. Compilação aprovada; repetição das duas classes com falhas solicitada ao responsável.


Repetição focada concluída em 16/11/2026: o responsável executou `./mvnw -B '-Dtest=AudienceLyricsIntegrationTests,CatalogEnrichmentIntegrationTests' test` com **BUILD SUCCESS**. As quatro falhas anteriores foram resolvidas pelos ajustes das fixtures; as regras de produção, expectativas de autorização e migrations foram preservadas.
