# Publicar 0.1.0-beta.2

Preparação local em 18/11/2026. **Não significa que houve publicação.** O responsável fará commit, merge na main e push; só depois será escolhido o SHA do build. Não registrar SHA, digest ou IDs de execução fictícios.

## O que entra nesta versão

- WebSocket nos painéis de anfitrião, participante e músico; atualização manual por gesto na área principal.
- Cadastro opcional do participante com confirmação de e-mail, vínculo e recuperação da participação existente.
- Preferências e infraestrutura de avisos por WhatsApp oficial e Web Push. Web Push validado localmente pelo responsável; WhatsApp depende da configuração e validação real na Meta.
- Páginas públicas de privacidade, segurança, LGPD, termos, exclusão e ajuda sobre o callback, com links na home.
- V22: perfil, vínculo de conta, consentimento, inscrições e fila persistida de avisos. V1–V21 preservadas.

O painel `/tv` ainda não faz parte da implementação; existe somente o esboço visual. Favoritas e ranking pessoais também seguem futuros. Não anunciar esses recursos como entregues.

## 1. Antes do commit

Versão `0.1.0-beta.2` nos três arquivos: `frontend/package.json`, `frontend/package-lock.json` (raiz e pacote) e `backend/pom.xml`. O rodapé dos menus lê a versão do package; não há texto de versão para editar em cada painel.

Verificar que o commit inclui os arquivos novos, especialmente V22, módulo de notificações, WebSocket, service worker, manifest, páginas públicas e documentação. Não incluir `.env`, chaves VAPID, tokens, senhas, configurações locais ou artefatos de build.

O responsável executou 234 testes de backend: 233 passaram; a única falha era a expectativa antiga do texto de confirmação de e-mail. Os dois testes dessa classe passaram após a correção. Suíte crítica de interface: 36 execuções aprovadas; os seis cenários de contas foram repetidos após a padronização dos inputs e passaram. Testes de configuração/service worker: 23 aprovados. O CodeBuild repetirá o backend completo e a suíte crítica para o SHA exato da publicação.

## 2. Commit, merge e SHA

Fazer commit na branch de trabalho, merge na main e push. O merge sozinho não dispara a esteira atual. Depois, copiar o SHA completo de 40 caracteres do commit da main remota que deve ser construído. Se houver merge commit, usar o SHA dele, não o da branch antes do merge.

O executor atual exige que o SHA informado corresponda à ponta da main quando buscar a fonte. Se a main avançar, conferir a nova revisão e atualizar o SHA deliberadamente. Não reutilizar `0.1.0-beta.2` para outro código depois que a tag imutável tiver sido publicada.

## 3. Build no console AWS

Usar a conta SingFlow `505828739529`, região **Ohio / us-east-2**.

1. Abrir **CodeBuild → Build projects → singflow-manual-build-release**.
2. Selecionar **Start build with overrides**.
3. Em **Environment variable overrides**, informar:

   | Nome | Valor | Tipo |
   | --- | --- | --- |
   | `SOURCE_REVISION` | SHA completo da main escolhida | Plaintext |
   | `EXPECTED_VERSION` | `0.1.0-beta.2` | Plaintext |

   São metadados públicos. Não adicionar segredos do app ao build. O valor padrão do projeto pode continuar beta.1; o override vale para esta execução.
4. Iniciar uma única execução e acompanhar **Build history → execução → Build logs**. Ela consome minutos de CodeBuild mesmo se um teste falhar.
5. Aguardar **SUCCEEDED**. Isso confirma testes/build/publicação das duas imagens, não instalação na EC2.

As imagens são construídas na AWS e publicadas no ECR, sem transferi-las pela internet local. Publicar no ECR não liga nem atualiza uma EC2 parada. O instalador manual existente exige EC2 ligada, gerenciada pelo SSM e os containers atuais saudáveis.

## 4. Recibo e prerelease GitHub

Em **Artifacts**, abrir o bucket S3 e baixar o `release.zip` desta execução. Extrair `release.published.json` e guardar, por exemplo, em `/private/tmp/singflow-beta2/release.published.json`. Validar versão beta.2 e SHA exato. Não usar o recibo da beta.1.

Para criar a tag e a prerelease com recibo verificado, na raiz do repositório e com GitHub CLI autenticado:

```bash
python3 scripts/aws/github-release.py \
  --manifest /private/tmp/singflow-beta2/release.published.json
```

Cria `v0.1.0-beta.2` e prerelease no commit do recibo. Não mover tags existentes. A criação da release não implanta na EC2.

## 5. Ambiente antes de implantar

O deploy preserva `/opt/singflow/backend.env`, os volumes e a configuração pública do frontend; mudanças no `.env` local não são transferidas automaticamente.

- Revisar o bloco de avisos em `.env.example` e o [guia de contas e notificações](../participant-accounts-notifications.md).
- Para Web Push, configurar chaves VAPID persistentes, contato, `SINGFLOW_WEB_PUSH_ENABLED=true` e worker habilitado. Nunca retornar a chave privada ao navegador. Não gerar um novo par em cada deploy.
- Para verificar o webhook sem enviar WhatsApp, configurar segredo do app e verify token, mantendo envio desativado. A URL técnica será `https://singflow.flowave.tec.br/api/public/whatsapp/webhook`; não usar `/callback` como endpoint técnico.
- SMTP continua necessário para confirmação de e-mail. Configurações existentes de banco, SMTP e APIs devem ser preservadas.

Alterações dos arquivos de ambiente só chegam aos containers com recriação usando esses arquivos; reiniciar o mesmo container não relê um env-file modificado. O instalador realiza a recriação na troca da versão. Não exibir arquivos privados em logs.

## 6. Implantar na EC2

Escolher momento sem uso do karaokê. O instalador interrompe brevemente o app e faz backup do PostgreSQL antes da troca. V22 será aplicada na inicialização; rollback de imagem não reverte migration.

Preparar o comando, ainda sem executar na AWS:

```bash
python3 -B scripts/aws/prepare-deploy.py \
  --manifest /private/tmp/singflow-beta2/release.published.json \
  --output /private/tmp/singflow-deploy-0.1.0-beta.2.json
```

Após revisar e autorizar a instalação, executar:

```bash
aws ssm send-command \
  --profile singflow-teste \
  --region us-east-2 \
  --cli-input-json file:///private/tmp/singflow-deploy-0.1.0-beta.2.json \
  --query 'Command.CommandId' \
  --output text
```

Se credenciais estiverem expiradas, renovar o login do perfil correto antes de operar. Guardar o ID retornado. Acompanhar **Systems Manager → Run Command → Command history → ID do comando → Targets and outputs → ID da instância → View output**. Instância prevista no instalador: `i-0972aeebecab607ba`; confirmar que continua sendo o destino correto antes de executar.

Não executar uma segunda implantação enquanto a primeira estiver em andamento. O [guia de acompanhamento](acompanhar-deploy-aws.md) descreve as etapas PREFLIGHT, DOWNLOAD, BACKUP, INSTALL, SUCCESS e ROLLBACK.

## 7. Aceite em produção e registro

- Saúde pública `UP`, menus com `0.1.0-beta.2`, commit/digests iguais ao recibo e Flyway V22 aplicada.
- Login e fluxo anfitrião → convocar → participante → concluir; telas atualizadas pelo WebSocket.
- Cadastro/confirmação de e-mail, vínculo e recuperação sem duplicar participantes ou pedidos.
- Web Push em HTTPS: ativar e convocar, validar ausência de aviso antigo após conclusão. No iPhone, abrir pela Tela de Início.
- Páginas públicas acessíveis sem login. Verificar webhook e envio WhatsApp somente quando os parâmetros Meta estiverem prontos.

Depois, registrar SHA, build ID, recibo/digests, tag GitHub, comando SSM, backup e resultado dos testes reais. Até isso acontecer, esta versão permanece **preparada localmente, não publicada**.

Referência oficial do console: [Executar build com overrides](https://docs.aws.amazon.com/codebuild/latest/userguide/run-build-console.html).


## Correção do teste dos scripts — 18/11/2026

O build remoto reconheceu beta.2 e foi interrompido nos testes dos scripts: dois cenários usavam arquivos da aplicação real, mas esperavam beta.1. Os testes passaram a criar package, lock e POM próprios em diretórios temporários; os cenários verificam divergência de cada metadado e reaproveitamento das imagens em beta.1, beta.2 e 1.0.0. Não foi relaxada a validação de versão no build real, nem desabilitado teste.

Mensagens com SHA `aaaaaaaa…`, `release-url` e rollback durante `unittest` vêm de executores simulados. Essa etapa não implanta na EC2. Depois de enviar a correção e fazer merge, informar o **novo SHA completo da main** ao iniciar o próximo build; não repetir o SHA da execução que falhou. A versão segue beta.2 porque esta falha ocorreu antes da construção/publicação das imagens.
