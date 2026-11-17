# Roadmap incremental

Cada etapa exige autorização antes de sua implementação. Documentação representa o plano, não a conclusão dos incrementos.

## Próximas prioridades — atualização de 17/11/2026

O responsável priorizou tempo real para reduzir consultas periódicas. Este registro define a ordem de discussão; não autoriza implementação, novos recursos ou envio de notificações. O segundo build remoto terminou com uma falha de UI; a seleção crítica de publicação foi revisada posteriormente conforme decisão do responsável.

1. **WebSocket na fila e no palco:** atualizar anfitrião, participante e músico por eventos pertinentes, publicados após confirmação da transação. Preservar autenticação, autorização por sessão/participante, revogação, concorrência e idempotência. Ações continuam REST; sincronizar estado ao conectar/reconectar e ao retornar ao app. Consolidar eventos para evitar múltiplos GETs por ação. Polling de contingência deve ser moderado e usado somente quando necessário; heartbeat não deve consultar o banco.
2. **Alertas no app e Web Push optativo:** próximo da fila, convocação, resposta à convocação e encerramento, com destinatários definidos por painel. WebSocket atende a interface ativa; notificação com app fechado/em segundo plano exige Web Push, service worker e permissão. Em iOS, considerar instalação na Tela de Início. Definir preferências, validade, deduplicação e abertura do contexto correto; aviso atrasado nunca substitui o estado atual do servidor. Avaliar este escopo antes de implementar.
3. **Demais áreas de tempo real:** sincronização do catálogo e consulta administrativa das sessões, após consolidar fila/palco. A busca em APIs externas não deve ser disparada por notificações sem necessidade.
4. **Suíte rápida de publicação (validada localmente e na AWS):** 30 execuções críticas de interface (24 mobile e seis desktop), com regressão completa de 272 preservada em comando e workflow manual separados. Backend, migrations, configuração e scripts mantêm verificação integral. Todos os 30 casos passaram localmente em 1,3 minuto e na AWS em 1,7 minuto. Publicação ECR `0.1.0-beta.1` concluída pelo build `d8e21f5b-2260-412c-b93f-a2fb2aae1a3d`; tag/prerelease GitHub criada e implantação na EC2 concluída, com saúde verificada e migrations até V21. Seleção e falha não bloqueante de foco: [Testes de publicação](deployment/testes-publicacao.md). Não excluir testes do repositório apenas pelo tempo; revisar o gate ao implementar tempo real.

Levantamento atual no frontend: participante a cada 10 s; músico, consulta administrativa de sessão e descoberta de participantes na sessão vazia a cada 4 s; sincronização do catálogo a cada 2 s. Intervalos têm condições de visibilidade/estado e não representam necessariamente requisições contínuas em todas as telas. Verificar também o polling do painel de palco no desenho do contrato de eventos.

## Prioridade de desenvolvimento — atualização de 10/11/2026

O responsável adiou a investigação de hospedagem/deploy para outro chat, mais tarde ou no dia seguinte. AWS, Aiven e orçamento permanecem em avaliação; não criar recursos nem continuar a migração neste trabalho.

Próxima sequência proposta:

1. Revisar a operação atual e desenhar os novos painéis do anfitrião e do participante (etapa 3B).
2. Aprovar o protótipo e autorizar a implementação; entregar anfitrião e participante em incrementos, com acessibilidade e regressão dos fluxos existentes.
3. Revisar e implementar a experiência do músico (etapa 3C).
4. Evoluir catálogo híbrido e tempo real (etapa 4), depois PWA e operação (etapa 5).

O responsável informou ter testado as últimas implementações antes de retomar o deploy. Esse relato não discrimina novamente os modos local e Docker para cada evolução; preservar essa distinção nos registros de validação.

## Piloto Café Tão

A inscrição assistida pelo anfitrião foi aprovada como fluxo principal, junto ao check-in autônomo. O [plano de MVP](mvp-cafe-tao.md) registra a meta de 11/11/2026 pela manhã e separa o detalhamento aprovado das demais propostas ainda em revisão. Nenhuma implementação é autorizada apenas pelo registro desse plano.

## Etapa 0 — Registro da arquitetura (concluída)

Escopo: README, arquitetura, decisões e este roadmap, preservando arquivos existentes.

Aceite: stack e organização registradas; propostas e questões abertas identificadas; nenhuma alteração no código ou configuração existente.

## Etapa 1 — Fundação técnica (implementada; configuração de licença validada pelo responsável)

Escopo proposto: conferir versões e licenças; configurar Modulith, Flyway e Security; criar base Angular/PrimeNG/Tailwind/PrimeIcons; revisar Compose com PostgreSQL fixado e variáveis de ambiente; preparar verificações e instruções reproduzíveis. Arquivos `.gitignore` e `.env.example` serão propostos nesta etapa. Não versionar segredos.

Aceite:

- Backend compila e seus módulos passam na verificação de arquitetura.
- Flyway inicializa um PostgreSQL vazio; Hibernate valida o esquema.
- Frontend compila e apresenta estrutura responsiva com identidade SingFlow.
- Configuração de desenvolvimento separada de produção, sem credenciais de exemplo de produção.
- README contém comandos efetivamente testados e limitações verificadas.

Revisão concluída: login funcional adiado para o primeiro fluxo; versões fixadas e testes locais aprovados. A configuração da licença foi validada pelo responsável após a revisão do carregamento por ambiente. Resultados e limitações em [Fundação técnica](foundation.md).

## Etapa 2 — Primeiro incremento funcional: acesso e inscrição assistida (aceito em serviços independentes e Docker)

Escopo entregue e aceito: acesso provisionado do anfitrião, criar/abrir/encerrar sessão, inscrição assistida com primeira música, busca, novos pedidos no mesmo cadastro, lista por check-in e saída com cancelamento dos pedidos pendentes e preservação do histórico.

O responsável informou teste completo com serviços independentes e Docker, incluindo persistência após reinício. A verificação backend com PostgreSQL retornou `BUILD SUCCESS`. Evidências e limites em [Aceite 001](acceptance/001-assisted-flow.md).

Check-in autônomo, retorno, fila sugerida e convocações não foram entregues nem aceitos nesta etapa. Hospedagem adiada por decisão do responsável.

## Incremento atual — fila sugerida e palco

A [revisão do próximo incremento](stage-review.md) reúne as propostas das etapas 2B e 3 para o piloto. As regras e o recorte foram aprovados, incluindo o desempate contra repetição imediata; a implementação foi autorizada e concluída, com testes aprovados e aceite manual confirmado nos dois modos, incluindo reinício. Registro em [Aceite 002](acceptance/002-stage-flow.md). Veja [Ensaio de fila e palco](stage-testing.md).

## Etapa 2B — Fila sugerida assistida (aceita em serviços independentes e Docker)

Escopo entregue: motor de sugestões para os participantes assistidos e pedidos em texto livre existentes, incluindo repetições com “música a escolher”. Catálogo base e pedidos autônomos permanecem para outro incremento. Aplicar a [ADR 004](decisions/004-participation-and-repeat-suggestions.md).

Aceite:

- Prioridade por apresentações concluídas, evitar repetição imediata entre empatados, depois existência de pedido elegível e check-in.
- Múltiplos pedidos são balanceados por pessoa.
- Sugestões sem pedidos não criam solicitações fictícias nem contam como apresentações.
- Somente elegíveis recebem sugestões; sugestão não confirma convocação.
- Interface informa a justificativa e permite revisão pelo anfitrião.

Decisões aprovadas em `stage-review.md`: uma posição por pessoa e uma convocação ativa, com reserva do pedido e contagem de conclusões. Aceite manual confirmado pelo responsável nos dois modos.

## Etapa 3 — Operação do palco e auditoria (aceita em serviços independentes e Docker)

Escopo proposto: confirmar convocação, concluir apresentação, tratar cancelamento/ausência e intervenções, recalcular sugestão e registrar auditoria.

Aceite:

- Convocação confirmada não muda com recálculo da sugestão.
- Conclusão repetida não duplica contagem.
- Duas confirmações concorrentes não produzem efeitos duplicados ou estados inválidos.
- Alteração e auditoria crítica são atômicas; intervenção registra motivo.
- Testes verificam retentativas, concorrência e isolamento por sessão.
- Recusa pausa sugestões sem falta; falta é confirmada pelo anfitrião.
- Primeira falta suspende até nova oportunidade após rodada; segunda falta consecutiva inativa e suspende pedidos. Conclusão zera faltas.
- Saída voluntária cancela pedidos pendentes, preserva convocações e sinaliza desistência quando necessário.
- Reativação por ausência tem confirmação do anfitrião, nova posição de chegada e preservação das apresentações.

Transições detalhadas e implementadas conforme revisão aprovada, com testes backend e interface aprovados. Reinício e operação real validados pelo responsável com serviços independentes e Docker.

## Incremento em validação — participante pelo celular

Recorte proposto: check-in sem conta por link/QR Code, envio e consulta de pedidos próprios, acompanhamento de convocação e saída, preservando o fluxo assistido. A [revisão do participante](participant-review.md) detalha decisões pendentes, credencial separada, duplicidade, privacidade e acesso por aparelho real. Recorte e parâmetros operacionais aprovados; implementação autorizada. O [roteiro de validação](acceptance/003-participant-flow.md) reúne os testes locais e Docker; aceite manual pendente.

### Evolução aprovada — sair e voltar

[Plano de retorno do participante](participant-return-review.md): saída voluntária mantém acesso limitado, retorno exige nova música e nova chegada, preservando apresentações e histórico. Retirada pelo anfitrião impede retorno autônomo. Regras e implementação autorizadas; evolução implementada e testes automatizados aprovados. [Ensaio local/Docker](acceptance/004-participant-return.md) pendente de aceite manual. Mantém o controle do anfitrião sobre pausas e faltas.

### Evolução aprovada — acesso pelo celular para inscrição assistida

Implementado nesta versão. O anfitrião encontra o ícone de QR Code na lista de participantes assistidos e nos detalhes da pessoa. O modal mostra o estado do vínculo e permite trocar de celular.

A migration V8 adiciona convites individuais. Cada QR tem validade de cinco minutos, uso único e validação sob o bloqueio da sessão. Gerar outro QR substitui o convite pendente. A confirmação preserva a origem assistida e os dados da participação. A saída invalida o convite pendente.

Validação de backend com PostgreSQL confirmada pelo responsável via `./mvnw -B verify`, incluindo inclusão de música após o vínculo, preservação da convocação, expiração, autorização, revogação do aparelho anterior, confirmação explícita de troca e disputa simultânea pelo mesmo código. Os 48 testes de interface passaram com API simulada em desktop e mobile. O ensaio integrado em celular físico fica disponível para validação pelo responsável após atualizar o backend pela IDE.

1. O anfitrião toca no ícone de QR Code ao lado do participante. O modal **Conceder acesso** mostra um QR individual, de uso único e com validade curta.
2. Ao escanear, a pessoa vê o nome do participante e confirma que quer assumir aquela participação. O celular é vinculado à inscrição existente, preservando a prioridade do check-in, os pedidos, o histórico e a convocação em andamento.
3. Pelo celular, o participante pode gerenciar seus pedidos, responder a convocações e sair da fila. O anfitrião continua podendo ajudar com músicas e operar o palco.
4. O anfitrião vê **Celular vinculado** e pode usar **Trocar celular**. O acesso anterior só é revogado quando o novo aparelho conclui o vínculo. Se o QR expirar, o acesso existente segue válido. Se o aparelho já estiver vinculado a outra pessoa na sessão, a troca requer confirmação explícita.

O QR geral da sessão serve para novas inscrições. O QR individual aparece no modal do anfitrião e concede acesso apenas à participação selecionada.

## Etapa 3B — Redesenho, acessibilidade e usabilidade dos painéis (dois incrementos do anfitrião implementados)

Etapa solicitada pelo responsável: redesenhar os painéis do anfitrião e do participante, preservando identidade SingFlow, stack e regras de negócio. O [plano de redesenho](panels-redesign.md) detalha os fluxos e critérios de acessibilidade, com referência WCAG 2.2 AA.

Entregas: diagnóstico das telas atuais, wireframes responsivos, protótipo para aprovação e, após autorização, implementação incremental e validação. No anfitrião, priorizar operação de palco e inscrição assistida; no participante, situação atual, nova música, chamada e saída/retorno.

Aceite: tarefas principais claras em desktop e celular, operação por teclado, foco e contraste verificados, rótulos e mensagens acessíveis, atualização sem interromper preenchimento e regressão das regras existentes. Avaliação automática acompanhada de verificação manual e evidências. O [desenho do anfitrião](host-redesign-approved.md), com 17 telas (00–16), foi aprovado em 10/11/2026. Os desenhos do participante e do músico também foram aprovados na conversa. O [incremento 01 do anfitrião](host-redesign-increment-01.md), autorizado em 10/11/2026, entrega base visual, login e sessões, com aceite manual confirmado. O [incremento 02](host-redesign-increment-02.md) entrega participantes e palco, com aceite manual pendente. Demais incrementos exigem autorização específica; a aprovação visual não altera regras de negócio.

Padrão transversal autorizado em 10/11/2026: [menus flutuantes e diálogos de confirmação](interaction-patterns.md) compartilhados entre os painéis.

## Etapa 3C — Experiência do músico (primeiro incremento implementado)

O músico faz cadastro e login próprios. O anfitrião libera ou revoga o acesso à sessão pelo e-mail da conta. O painel de consulta apresenta convocação atual, música/artista, confirmação de ida, fila sugerida completa, busca e histórico, seguindo os componentes e a identidade visual dos demais painéis.

Atualização por consultas REST a cada quatro segundos enquanto a página está visível. A migration V11 acrescenta papéis às credenciais existentes e liberações auditadas por sessão. O cadastro público cria somente o papel MUSICIAN. O [roteiro do músico](acceptance/005-musician-flow.md) descreve o ensaio e as verificações de permissão.

Os painéis do anfitrião e do participante receberam aceite manual na conversa antes deste incremento. A conclusão pelo anfitrião continua contabilizando a apresentação e liberando a fila mesmo quando o participante não confirma a ida.

## Etapa 4 — Catálogo híbrido e tempo real

Escopo proposto: sugestões, aprovação/rejeição e notificações WebSocket para os três perfis.

Aceite:

- Cadastro musical provisório não bloqueia pedidos nem apresentações; apenas entradas aprovadas compõem a busca local do catálogo.
- Aprovação/rejeição tem ator e registro auditável.
- Eventos são enviados após commit e assinaturas respeitam autorização.
- Reconexão recupera o estado oficial por REST, inclusive após perda de eventos.

Definido em 12/11/2026: catálogo único para todo o SingFlow, organizado pelo admin, com provisórios sem bloquear o palco. O primeiro incremento está registrado no Aceite 011; notificações WebSocket continuam pendentes.

## Etapa 5 — PWA e preparação de publicação

Escopo proposto: instalação, cache seguro da interface, atualização do aplicativo, conexão instável e preparação de implantação. A acessibilidade começa na etapa 3B e continua como requisito transversal. A execução da hospedagem permanece adiada para outro chat conforme a decisão atual do responsável.

Aceite:

- Aplicação instalável em ambiente HTTPS compatível.
- Desconexão é visível e não gera confirmação falsa de operações.
- Atualizações de versão e logout não expõem dados em cache a outro usuário.
- Fluxos principais funcionam em tela pequena e por teclado.
- Implantação, migrações, backup e recuperação possuem instruções verificadas.

A escolha do provedor e qualquer publicação serão revisadas separadamente. Commits e push não estão incluídos automaticamente nestas etapas.

## Busca de músicas Last.fm — 11/11/2026

Implementação autorizada: componente compartilhado nos formulários de anfitrião e participante, a partir de 3 caracteres, até 10 sugestões e texto livre permitido. Consulta via backend com `LASTFM_API_KEY`, sem chave no frontend. Este incremento não implementa aprovação de catálogo nem WebSocket. Configuração e ensaio em [Aceite 009](acceptance/009-song-search.md).

## Catálogo SingFlow — incremento de 12/11/2026

Implementação autorizada: catálogo global, revisão administrativa, entradas provisórias sem bloquear o palco e vínculos com pedidos/convocações existentes. Área Admin → Catálogo, V14 e busca local complementada pelo Last.fm implementadas. Backend validado pelo responsável com BUILD SUCCESS; ensaio integrado pendente. [Roteiro 011](acceptance/011-singflow-catalog.md).

Retirada a proposta de prioridade por assiduidade. Contas opcionais de participantes, associação, rankings e recomendações ficam para incrementos posteriores. Mecanismos futuros de benefícios devem preservar as regras isonômicas da fila.

## Sincronização das provisórias — 12/11/2026

Implementados acompanhamento em tela, processamento persistente, aprovação automática conservadora e revisão com escolha Last.fm ou edição manual, pausa/retomada, vínculo explícito de duplicatas e auditoria. Backend validado pelo responsável com BUILD SUCCESS e 110 testes de interface aprovados com API simulada. [Ensaio integrado pendente](acceptance/012-catalog-synchronization.md). WebSocket, rankings, links de repertório e conta opcional do participante continuam em etapas separadas.

## Escolhas do participante — 12/11/2026

Implementados catálogo aprovado, busca complementar Last.fm, texto livre, seleção externa validada no backend com aprovação automática e setas para reordenar pedidos pendentes. Prioridade entre pessoas preservada. V16 e backend validados pelo responsável com BUILD SUCCESS; [ensaio 013](acceptance/013-participant-song-choices.md). WebSocket, rankings, links de repertório e contas opcionais continuam em incrementos posteriores.

## Intervenções do anfitrião — 12/11/2026

Implementadas ordem manual persistente por oportunidade, convocação explícita fora da vez e botões de pausa/retomada com preservação dos pedidos. V17 validada pelo responsável com BUILD SUCCESS. [Ensaio 015](acceptance/015-host-queue-interventions.md). Músico e participante consultam a ordem efetiva. Benefícios de assiduidade continuam sem interferir na prioridade.

## Navegação inferior do anfitrião — 12/11/2026

Implementadas abas Fila, Participantes e Histórico com barra fixa e estado preservado. Criar participante passa a existir somente em Participantes; diretório é exibido na tela e detalhes continuam em modal. Sem mudança de backend. [Ensaio 016](acceptance/016-host-bottom-navigation.md). Navegação inferior do participante e do músico segue em etapas posteriores.

## Rolagem interna do anfitrião — 13/11/2026

Integrado PrimeNG ScrollArea com estado de rolagem por aba e CdkScrollable para arraste nas bordas. Header e dock fixos; card da sessão acompanha o conteúdo rolável conforme orientação do responsável. Sem mudança de backend. [Ensaio 017](acceptance/017-host-scrollarea.md).

## Padronização do participante — 13/11/2026

Anfitrião aceito como referência visual; participante adaptado para header com contexto/menu, dock Pedidos/Catálogo/Histórico, ScrollArea e itens compartilhados. Catálogo direto, modais com busca fixa e histórico com faixa lateral. Fluxos de convocação, saída/retorno e pedidos preservados. O [padrão de telas](ui/screen-pattern.md) registra a referência para futuras implementações. Font Awesome Free 7.3.1 adotado para todos os ícones explícitos da aplicação, conforme tabela aprovada; PrimeIcons removido como dependência direta. Build e 172 testes de navegador em desktop/celular aprovados. [Roteiro de aceite](acceptance/022-participant-workspace.md); aceite manual deste redesenho aguarda o responsável.

## Frontend Node.js parametrizável — 13/11/2026

Preparado servidor HTTP para a Hostinger, com entrega do Angular, fallback de rotas, proxy da API com cookies/CSRF e `BACKEND_URL` lida em runtime. Pacote independente gerado no build; dependência do Netlify removida. Modelos de ambiente revisados por serviço, incluindo limites de cadastro de músico e flag da sincronização. O responsável fará commit e deploy; produção não alterada nesta preparação. [Guia da Hostinger](hostinger.md).

## Padronização do músico e admin — 14/11/2026

Implementação autorizada para uniformizar a UI do MVP. Músico passa a Palco/Fila/Histórico; admin passa a Cadastros/Sessões/Catálogo. Header fixo, dock, ScrollArea, tipografia e itens compartilham o padrão atual. Sessões antigas do músico continuam em modal e o acesso permanece de consulta. Filtros administrativos são preservados entre abas; saída da sincronização mantém aviso de revisão pendente. Sem alteração de API, migrations ou regras da fila. Validação e roteiro em [Aceite 028](acceptance/028-musician-admin-workspaces.md). Aceite em aparelho físico pendente. Esta seção substitui o estado visual antigo da etapa 3C; WebSocket e demais evoluções seguem pendentes.

Validação da padronização: build e formatação aprovados; 68 testes dos dois painéis e recarga aprovados com API simulada. A regressão geral e os timeouts de testes antigos estão discriminados no Aceite 028; não confundir emulação de celular com aceite físico.

## Catálogo administrativo com abas — 15/11/2026

Implementação autorizada: layout de catálogo do participante reaproveitado no admin, com abas Catálogo/Sincronizar, busca fixa, lista em ScrollArea e gestão existente preservada. Sem alteração de backend, migrations ou infraestrutura. Registro em [Aceite 029](acceptance/029-admin-catalog-tabs.md).


## Gestão incremental do catálogo administrativo — 16/11/2026

Itens alinhados ao catálogo do participante, informação e exclusão com confirmação, situação no diálogo de detalhes, carregamento incremental de dez itens e pesquisa automática com inclusão Last.fm comprovada pelo backend. Exclusão lógica somente sem associações de uso, preservando auditoria e bloqueando pedidos cancelados, apresentações, sincronizações e unificações. V18 acrescentada; migrations anteriores preservadas. Sincronização mostra somente pendências de intervenção e volta ao estado limpo na mesma aba quando o lote está totalmente resolvido, mantendo histórico no banco. Validação e ensaio em [Aceite 030](acceptance/030-admin-catalog-management.md). Sem commit ou publicação neste incremento.


## Música canônica e configuração de tom — 16/11/2026

Implementados catálogo como fonte única de título/artista, JOINs para exibição, transferência de todos os vínculos na unificação e remoção física dos registros absorvidos com auditoria/aliases preservados. V19 normaliza também unificações antigas. Participante configura semitons no pedido pendente; músico visualiza Tom no palco/fila/histórico e registra o tom efetivamente cantado durante ou após a apresentação. Trocar música limpa a configuração. Preferência pessoal persistente e sugestões baseadas no tom cantado ficam para cadastro de participantes. [ADR 005](decisions/005-canonical-music-and-performance-keys.md) e [Aceite 031](acceptance/031-canonical-music-and-keys.md). Sem commit ou deploy.


## Cifra Club — 16/11/2026

Implementados busca com sugestão principal `top_result` para confirmação, referência oficial administrativa e preferência pessoal do músico por perfil/música, com fallback ao catálogo. V20, auditoria, permissões, concorrência e preservação de alternativas na unificação validadas pelo responsável com BUILD SUCCESS. Interface pública do provedor isolada em adaptador, com cache, limites, flag e link manual. [ADR 006](decisions/006-cifra-club-references.md) e [Aceite 032](acceptance/032-cifra-club.md). Ensaio físico/integrado pendente; sem commit ou deploy. Spotify, YouTube, letras e WebSocket permanecem pendentes.


## Referências de streaming — 16/11/2026

Implementados contratos `StreamingSearch`/`StreamingReferenceStore`, registro por tipo, adaptador Spotify, escolha administrativa do link oficial e botões por plataforma no músico. Credenciais somente no backend; cache, limites, falhas e vínculo manual preservados. Sem migration nova. Backend validado pelo responsável com BUILD SUCCESS; build e 32 testes de interface passaram com API simulada. [ADR 007](decisions/007-streaming-search.md) e [Aceite 033](acceptance/033-streaming-search.md). Consulta assíncrona ao cadastrar pedidos está em análise, sem implementação automática. Deezer, player, YouTube, letras e WebSocket seguem pendentes. Sem commit ou deploy.


## YouTube no streaming — 16/11/2026

Adaptadores de busca/persistência YouTube integrados ao `StreamingSearch`, reutilizando a modal e os botões por tipo. Escolha administrativa, link oficial, coexistência com Spotify, paginação por tokens, cache e limite diário local. Coluna `youtube_url` existente, sem migration. Backend com banco validado pelo responsável com BUILD SUCCESS. [Aceite 034](acceptance/034-youtube-streaming.md). Sem publicação. Enriquecimento assíncrono, player, letras e WebSocket continuam separados deste incremento.


## Letras do participante — prova de conceito LRCLIB, 16/11/2026

Contrato `LyricsSearch` com adaptador LRCLIB, consulta protegida por convocação aceita e letra simples dentro do card de status. Rolagem manual, fonte/estados explícitos, cache temporário e descarte de resultados antigos; sem migration ou persistência permanente de letras. Build, sete testes focados e 32 cenários de interface passaram. Validação com PostgreSQL temporário solicitada ao responsável; [ADR 008](decisions/008-participant-lyrics.md) e [Aceite 035](acceptance/035-participant-lyrics.md). Sem publicação. Sincronização de letra/rolagem, edição e associação de versões seguem para incrementos posteriores.


## Antecipação das letras na convocação — 16/11/2026

Confirmar a convocação agenda a consulta LRCLIB após commit, em worker com fila limitada e deduplicação, sem bloquear a chamada ou gravar texto permanentemente. Participante continua vendo a letra só após aceitar, com consulta sob demanda como fallback. Cache compartilhado e leitura imediata de entradas já prontas; ausência de rede em rollback/idempotência. Compilação e 18 testes focados passaram; verificação completa com PostgreSQL temporário solicitada ao responsável. [ADR 008](decisions/008-participant-lyrics.md) e [Aceite 035](acceptance/035-participant-lyrics.md). Sem frontend, migration, commit ou deploy novos nesta antecipação.


## Enriquecimento de músicas novas por pedido — 16/11/2026

Fila persistida V21 por música/provedor, criada junto com um novo cadastro originado de pedido. Letra no cache; sugestões de cifra/Spotify/YouTube no banco para confirmação nas modais existentes. Reaproveitamento de músicas, retomada de claims, tentativas limitadas, preservação de oficiais e descarte de respostas antigas após correção/unificação. Backend validado pelo responsável com BUILD SUCCESS, incluindo a correção do teste de revogação de letras. Build final e 36 cenários de UI passaram. [ADR 009](decisions/009-request-resource-enrichment.md) e [Aceite 036](acceptance/036-request-resource-enrichment.md). Sem publicação/AWS. O resultado completo também conclui as verificações anteriores de letras e antecipação que estavam pendentes. Sincronização de letra, player e WebSocket continuam em etapas posteriores.


## Cache de letras por sessão — 16/11/2026

TTL positivo substituído por retenção durante a sessão aberta. Cache central associado às sessões consumidoras, compartilhamento seguro e limpeza após commit do encerramento; a última sessão consumidora libera a letra. Tarefas/consultas tardias não restauram entradas encerradas. Letras não encontradas/instrumentais mantêm dois minutos para nova tentativa. Adaptador HTTP separado do cache. Compilação e 22 testes focados passaram; integração com PostgreSQL temporário solicitada ao responsável. [ADR 008](decisions/008-participant-lyrics.md) e [Aceite 035](acceptance/035-participant-lyrics.md). Sem migration, frontend, commit ou deploy.
