# Testes críticos para publicação

Revisão de 17/11/2026. O responsável antecipou a revisão após o build remoto: backend com 211 testes aprovados; interface com 269 aprovados, 2 ignorados e 1 falha, em 8,8 minutos. Build `dcfa129f-d001-479e-abac-92692b576d26`, commit `bc55b275838b4ac783d311e3261aa25c53641870`. Nenhuma imagem foi publicada e não houve implantação.

## Decisão

Manter `npm test` e `npm run test:full` como regressão completa (272 execuções existentes). Criar `npm run test:release` para 24 cenários mobile e seis repetições no desktop, total de 30 execuções. Usar tags Playwright explícitas; novos testes não entram automaticamente na publicação. Revisar a seleção quando entrar uma funcionalidade crítica, especialmente WebSocket e Web Push. Não usar `--pass-with-no-tests`, `continue-on-error` ou retry para ignorar falha crítica.

CodeBuild e os checks habituais de frontend no GitHub executam a suíte crítica. O workflow Frontend oferece execução manual com `suite=full`; a suíte completa também pode ser executada localmente. Não há agenda periódica ativada. Executar a completa antes de promover para versão estável, após mudanças abrangentes de UI e ao revisar bugs nas áreas correspondentes.

Manter integralmente `mvn verify`, testes de configuração do frontend, formatação, build Angular e testes dos scripts AWS. O backend completo levou aproximadamente um minuto na execução observada; o maior ganho agora está nos E2E duplicados por viewport.

O total de casos da interface no gate cai de 272 para 30 (cerca de 89%). Isso não promete a mesma redução no tempo total: provisionamento, dependências, backend e Docker continuam presentes. Medir a primeira publicação após a mudança.

## O que permanece crítico

Migrations, permissões/CSRF, isolamento e integridade/concorrência continuam cobertos pelo backend completo. Na interface: login, gestão de sessão, inscrição/pedidos sem duplicidade, ordenação/reserva, convocação/conclusão, acesso/retorno do participante, QR individual, acesso/revogação de músico, aprovação administrativa, salvamento e exclusão segura no catálogo, revisão sem falso sucesso e tom da apresentação.

## Seleção exata

| Arquivo / cenário | Mobile | Desktop |
| --- | --- | --- |
| `host-session-design.spec.ts` — login supports password visibility, failure and recovery without exposing the account menu | Sim | Não |
| `host-session-design.spec.ts` — create, cancel, open and register empty session retain a mobile layout and deliberate transitions | Sim | Sim |
| `host.spec.ts` — host registers and adds songs without duplicating participation | Sim | Sim |
| `host-operation-design.spec.ts` — host drags the active queue, calls outside the order and pauses or resumes participants | Sim | Não |
| `stage.spec.ts` — concludes opportunity without request only after song is chosen | Sim | Sim |
| `host-session-design.spec.ts` — confirmation cannot dismiss or double submit while its operation is pending | Sim | Não |
| `participant.spec.ts` — host grants individual QR access and the phone confirms a replacement explicitly | Sim | Não |
| `participant.spec.ts` — participant joins, leaves, returns safely with a new song and forgets access | Sim | Não |
| `participant.spec.ts` — closed session and expired access never offer a new registration silently | Sim | Não |
| `participant.spec.ts` — participant can skip without leaving and confirm a later call | Sim | Não |
| `participant.spec.ts` — participant reopening restores the session and distinguishes position, next and called states | Sim | Não |
| `participant-catalog.spec.ts` — participant chooses catalog and Lastfm songs, continues choosing and falls back to free text | Sim | Não |
| `participant-catalog.spec.ts` — participant reorders only pending choices and reserved song has no reorder controls | Sim | Sim |
| `participant-catalog.spec.ts` — participant replaces a pending song in place and handles an already called song | Sim | Não |
| `participant-catalog.spec.ts` — participant call interrupts other tabs and returns to waiting after host completion without acceptance | Sim | Não |
| `musician.spec.ts` — musician signs in, receives a session, reads the full queue and tracks the stage | Sim | Sim |
| `musician.spec.ts` — host grants musician access and confirms revocation without repeating a grant after failure | Sim | Não |
| `accounts.spec.ts` — an ordinary host cannot open administration | Sim | Não |
| `accounts.spec.ts` — administrator approves and suspends with confirmation, reason and account version | Sim | Sim |
| `song-editor.spec.ts` — one Save retains all tab drafts, clears links and writes every change in one request | Sim | Não |
| `catalog-management.spec.ts` — catalogue appends pages, keeps state after failure and blocks deletion with associations | Sim | Não |
| `catalog-sync.spec.ts` — sync manual review keeps edits during polling and reports stale approval without false success | Sim | Não |
| `music-keys.spec.ts` — participant configures semitones with buttons and typing, retaining input after conflict | Sim | Não |
| `music-keys.spec.ts` — musician sees calculated key and records actual key during and after a performance | Sim | Não |

## O que fica na regressão completa

Não excluir testes do repositório nesta revisão. Ficam fora do gate rápido: detalhes de espaçamento/header/dock, formato de ícones, sombras e áreas de rolagem, retorno de foco de menus, quatro variantes de clipboard, múltiplos estados de loading, detalhes de letras/streaming e variações extensas de sincronização, responsividade e editor. Alguns riscos de dados nessas funções continuam cobertos por testes de integração do backend; não confundir exclusão do gate com ausência de risco ou aceite da falha.

Esses testes não são todos redundantes: vários representam regressões reais relatadas pelo responsável. Antes de apagar algum, provar cobertura equivalente em outro teste e registrar qual comportamento deixa de ser exercitado.

### Falha conhecida da regressão completa

`host-session-design.spec.ts` — `closing a floating menu preserves page scroll and restores its trigger`, projeto mobile. Após a segunda abertura do menu e `Escape`, o teste esperava foco no botão de conta, mas o botão permaneceu com `aria-expanded=true`; falhou também no retry. A causa ainda precisa de reprodução isolada para distinguir sincronização do teste e falha de teclado no componente. Não foi corrigida nem marcada como sucesso/skip. A verificação permanece na suíte completa e não bloqueia este gate crítico por decisão do responsável.

## Como executar

Com frontend iniciado pelo responsável pela IDE:

```sh
npm run test:release
npm run test:full
```

`--list` lista casos sem iniciar navegador ou servidor. Na CI, a configuração existente gerencia servidor descartável; localmente o agente não inicia/encerra serviços do app.

As APIs dos E2E são simuladas. A cobertura do backend usa PostgreSQL temporário; ainda há necessidade de ensaio integrado no celular e no ambiente publicado.

## Validação local desta revisão

A listagem confirmou 30 execuções críticas (24 mobile e seis desktop) e 272 na completa (136 por projeto). A falha de foco está presente nos dois projetos da completa e ausente na seleção de publicação. A suíte crítica passou integralmente: **30 passed (1.3m)**, usando frontend iniciado pelo responsável na IDE e APIs simuladas. Também passaram os 19 testes de configuração, 26 testes dos scripts AWS, formatação e verificação de sintaxe do runner. Nenhum teste/migration/código de produção foi removido ou alterado nesta seleção. Não foi iniciado novo build na AWS após essa revisão; os arquivos precisam de commit/push antes da repetição. Comparar 1,3 minuto local com 8,8 minutos na AWS indica potencial de redução, mas não mede o ganho remoto definitivo.

## Medição na AWS após a revisão

Build `d8e21f5b-2260-412c-b93f-a2fb2aae1a3d`, commit `e3350c3`: 30 testes críticos de interface passaram em **1,7 minuto**, contra 8,8 minutos da suíte completa anterior. Backend manteve 211 testes aprovados. Build total de aproximadamente 7 min 12 s, incluindo preparação e imagens, terminou em publicação bem-sucedida das duas imagens ECR. Recibo e digests em [Build remoto](build-remoto-aws.md#publicação-confirmada--17112026). A falha de foco continua pendente na regressão completa; não foi corrigida nesta publicação.


## Adaptação WebSocket — 18/11/2026

A branch `feature/websocket` acrescenta duas execuções críticas mobile (consolidação/reconexão/contingência e gesto de atualização). O gate passa a 32 execuções, preservando as seis desktop já selecionadas. O fluxo crítico do músico recebe eventos de concessão, aceite e revogação; o do participante recebe convocação e conclusão sem aceite via WebSocket, sem criar duplicatas de testes visuais. A regressão completa continua disponível e preservada. Medidas desta branch constam em `docs/websocket-review.md`; não houve build remoto nesta etapa.


A revisão da conclusão com letra aberta acrescentou esse cenário à seleção mobile, levando o gate a 33 execuções. A letra pronta e a resposta ainda pendente são exercitadas por eventos WebSocket; a regressão completa permanece disponível.
