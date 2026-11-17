# Build remoto manual e release versionada

Estado em 17/11/2026: infraestrutura autorizada e provisionada, stack `singflow-manual-build` em `CREATE_COMPLETE`. Arquivos publicados na main no commit `f4f84f70e2464bc3de3e10058dad6ff61fdaf0c6`. As duas primeiras execuções foram interrompidas pelos testes. A terceira publicou `0.1.0-beta.1` no ECR com sucesso, conforme registro abaixo. A tag/prerelease GitHub foi criada posteriormente; implantação ainda pendente, conforme registro abaixo.

Projeto: `singflow-manual-build-release`; bucket privado: `singflow-manual-build-artifacts-ci8ndzpd8xii`; logs: `/aws/codebuild/singflow-manual-build-release`. Operação CloudFormation: `2b5d0170-e2cb-11f1-81e0-0a605a67e8f7`. Validação de serviço sem eventos de erro e criação concluída. A leitura do projeto confirmou fonte manual, MEDIUM, concorrência 1, timeout 45 minutos e ausência de webhook; histórico de builds vazio. A consulta CloudTrail em Ohio não retornou trails; não foi configurada retenção durável de auditoria neste incremento.

## Fluxo deste incremento

Main pública do GitHub → CodeBuild sob demanda em Ohio → testes → duas imagens no ECR → recibo privado no S3. A criação de tag/release no GitHub e a instalação na EC2 são etapas separadas, executadas somente após autorização. Publicar imagens funciona com a EC2 desligada e não a inicia.

O repositório é `vilabrayner/singflow`, conta `505828739529`, perfil local `singflow-teste`, região `us-east-2`. A SCP da organização negou a consulta de provedores OIDC; esta alternativa não altera a SCP nem usa federação GitHub/AWS. Como o repositório é público, o projeto clona a main por HTTPS sem credencial GitHub. Se o repositório se tornar privado, interromper e redesenhar a autenticação.

Não há webhook, CodePipeline, CodeConnections ou publicação a cada push neste incremento. O responsável escolhe quando construir e quando implantar.

## Recursos propostos para aprovação

Template: `infra/aws/pipeline/manual-build.json`. Nome proposto do stack: `singflow-manual-build`, somente em Ohio. Criação exige `CAPABILITY_IAM`.

| Recurso | Configuração |
| --- | --- |
| CodeBuild | `singflow-manual-build-release`, Linux x86 MEDIUM, imagem curada fixada, concorrência 1, timeout 45 minutos |
| IAM | Uma função de serviço, restrita ao projeto, dois ECR existentes, logs e recibos |
| S3 | Um bucket privado, bloqueio público, criptografia, versionamento, recibos expiram em 90 dias |
| CloudWatch Logs | Grupo do projeto, retenção de 14 dias |
| KMS | Uma chave gerenciada pelo cliente, com rotação, para os logs |
| Política S3 | Exige transporte TLS |

ECR `singflow/backend` e `singflow/frontend` já existem; não serão recriados. A função não recebe acesso a EC2, SSM, alteração IAM ou segredos da aplicação. Docker privilegiado fica restrito ao executor temporário, necessário ao build e PostgreSQL dos testes. Sem VPC, NAT, capacidade reservada ou servidor Docker persistente.

Bucket, logs e chave têm Retain: excluir o stack não os apaga nem encerra seus custos automaticamente. A remoção posterior exige verificar os dados e autorizar a limpeza dos recursos retidos.

## Custo estimado

Preço consultado na AWS Price List em 17/11/2026 para Ohio: CodeBuild Linux x86 `general1.medium`, US$ 0,01/minuto. Chave KMS: US$ 1/mês por versão de chave, além de solicitações (referência: US$ 0,03 por 10 mil solicitações simétricas). Rotação pode adicionar versões cobradas conforme regras do KMS.

| Uso estimado | CodeBuild | KMS base | Subtotal |
| --- | --- | --- | --- |
| Uma execução de 20 minutos | US$ 0,20 | US$ 1/mês | US$ 1,20 no mês |
| Quatro execuções de 30 minutos | US$ 1,20 | US$ 1/mês | US$ 2,20/mês |
| Cinco execuções de 45 minutos | US$ 2,25 | US$ 1/mês | US$ 3,25/mês |

Além desses valores: armazenamento/operações ECR, S3, logs e KMS. Não inclui custos existentes de EC2, disco, IPv4, CloudFront ou impostos. Não desconta créditos ou franquias. Timeout limita cada execução, não o gasto mensal; repetições e falhas consomem minutos. A duração real será medida na primeira execução.

Fontes: [CodeBuild](https://aws.amazon.com/codebuild/pricing/) e [KMS](https://aws.amazon.com/kms/pricing/). SKUs consultados: `3PDGM6QMG5QC5DN7` (build) e `FEMX7ZQ4DJ6QE2KP` (chave).

## Identidade da versão

A versão deve coincidir em `frontend/package.json`, raiz e pacote no lockfile e `backend/pom.xml`. Para este lançamento: `0.1.0-beta.1`.

- Tag Docker: `0.1.0-beta.1` nos dois repositórios ECR.
- Tag Git: `v0.1.0-beta.1` no mesmo SHA completo de 40 caracteres.
- GitHub: prerelease `SingFlow 0.1.0-beta.1`.
- Manifest schema 2: versão, SHA, plataforma `linux/amd64` e dois digests verificados.
- Labels OCI: revisão e versão verificadas antes da publicação e implantação.

Tags ECR são imutáveis. Outra revisão requer outra versão, como `0.1.0-beta.2`; nunca sobrescrever uma versão publicada. Recibos schema 1 das publicações anteriores continuam aceitos pelo instalador.

Em repetição, imagens já publicadas são reutilizadas apenas após verificar SHA e versão nos labels. Se um repositório já possuir tag conflitante, interromper antes de publicar o outro. A publicação dos dois ECR não é uma transação: se o segundo push falhar, não há recibo completo nem deploy; repetir o mesmo SHA/versão para completar o par.

## Primeiro build pelo console

Após autorização e provisionamento:

1. Revisar, comitar e enviar os arquivos deste incremento à main. Isso é necessário: o CodeBuild executará `infra/aws/pipeline/run-release.sh` da main, não os arquivos locais ainda não publicados.
2. Copiar o SHA completo do commit e conferir versão `0.1.0-beta.1`.
3. AWS Console → Ohio → CodeBuild → `singflow-manual-build-release` → Start build / Start build with overrides.
4. Em Environment variables, sobrescrever `SOURCE_REVISION` com o SHA completo e `EXPECTED_VERSION` com `0.1.0-beta.1`. São valores públicos, sem senhas.
5. Iniciar somente após autorizar o custo. O build falha se a main tiver mudado entre a escolha do SHA e a obtenção da fonte. Atualizar deliberadamente o SHA e tentar novamente.
6. Acompanhar Build history → execução → Build logs. O link CloudWatch mostra o mesmo fluxo de logs.
7. Sucesso significa testes aprovados e ambas as imagens verificadas no ECR. Não significa implantação.

O executor usa Java 21 e a versão Node de `.nvmrc`, executa testes dos scripts, `mvn verify` com PostgreSQL temporário e verificações/build e suíte crítica Playwright do frontend. Só então constrói e publica imagens. Nenhum teste acessa o banco de produção. Credenciais SMTP, APIs e banco não entram nas imagens, artefatos ou logs.

Dependências e imagens-base são transferidas entre GitHub, registries e AWS. A conexão 5G fica apenas com comandos, console e pequeno recibo, sem upload/download local das imagens Docker.

## Recibo e tag/release no GitHub

Na execução bem-sucedida, abrir Artifacts → bucket S3 e baixar o `release.zip` privado. Ele contém apenas `release.published.json`; extrair em `/private/tmp`. Guarde uma cópia do recibo com a documentação da release antes da expiração no S3.

Depois de autorizar a publicação GitHub, com `gh` autenticado:

```sh
cd /Users/vilabrayner/Documents/GitHub/singflow
python3 scripts/aws/github-release.py --manifest /private/tmp/release.published.json
```

O script verifica recibo publicado, repositórios/digests, pertencimento do SHA à main e eventual tag existente. Cria tag exata e prerelease com o recibo anexado. Nunca move tag de outra revisão. O CodeBuild não recebe token GitHub; esta operação local envia apenas metadados e o recibo, sem Docker. Se uma release existente divergir ou o upload do anexo falhar, revisar antes de repetir; não sobrescrever manualmente tags para contornar a proteção.

## Implantação continua separada

Ver [deploy manual](deploy-manual-aws.md) e [primeiro build local](primeiro-build-local.md) para o instalador/SSM existente. O recibo publicado fornece os dois digests; `scripts/aws/prepare-deploy.py` prepara a operação. Não executar implantação com build incompleto. A EC2 baixa as imagens diretamente do ECR, preservando configuração e volumes. Publicação não altera a versão em execução.

Implantar fora do karaokê, após autorização. Migrations não são revertidas por rollback de imagem. Não iniciar serviços locais nem a EC2 automaticamente. Deploy com servidor desligado permanece uma etapa deliberada futura, sem registro automático de release desejada neste projeto manual.

## Verificações e limites

Testes dos scripts sem rede/Docker reais; `bash -n`; cfn-lint; controles selecionados com cfn-guard oficial 3.2.2; CloudFormation ValidateTemplate. Essas verificações não comprovam permissões de criação ou sucesso do primeiro build. SCP pode negar uma operação futura; informar a negação e não contornar a política. A primeira execução real ainda precisa validar disponibilidade de dependências e duração dentro do timeout.

## Revisão da suíte de publicação

Após a primeira validação completa na AWS, a suíte de interface da publicação foi separada da regressão completa: 30 execuções críticas em vez de 272. Backend permanece com verificação integral. Seleção, justificativas, falha de UI pendente e comandos em [Testes de publicação](testes-publicacao.md). Essa alteração precisa estar na main antes de um novo build; não modifica a execução AWS já encerrada.

### Primeiras execuções remotas

- `6ca85098-c091-4c0e-8749-ada47abf9939`, SHA `f4f84f70e2464bc3de3e10058dad6ff61fdaf0c6`: falha no teste de concorrência de retorno à sessão (snapshot de atividade PostgreSQL). Correção de teste enviada na main pelo responsável.
- `dcfa129f-d001-479e-abac-92692b576d26`, SHA `bc55b275838b4ac783d311e3261aa25c53641870`: backend 211/211 aprovado; interface 269 aprovados, dois ignorados e uma falha no foco de menu mobile. Interface completa em 8,8 minutos. Nenhuma publicação ECR ou implantação executada.

Após a revisão solicitada, o gate de interface passa a usar 30 execuções críticas. Elas passaram localmente em 1,3 minuto; o resultado real na AWS ainda será medido após commit/push. A falha de foco continua documentada e disponível na regressão completa, sem bloqueio deste gate por decisão do responsável.

## Publicação confirmada — 17/11/2026

Build `singflow-manual-build-release:d8e21f5b-2260-412c-b93f-a2fb2aae1a3d`, status `SUCCEEDED`, commit `e3350c3def4c30bd3c93bab2d166b50617428190`, versão `0.1.0-beta.1`. Execução de 18:57:13 a 19:04:25 (America/Recife): aproximadamente 7 min 12 s no total; preparação do executor de 123 s, fase principal de 303 s. Os 211 testes do backend e os 30 testes críticos de interface passaram. Interface em 1,7 min, contra 8,8 min na execução completa anterior; não confundir essa redução com o tempo total, que inclui dependências, preparação, imagens e envio.

As imagens Linux amd64 foram confirmadas diretamente no ECR com a tag imutável `0.1.0-beta.1`:

| Imagem | Digest | Tamanho comprimido |
| --- | --- | --- |
| backend | `sha256:53ca551631e0e7067f35ddc4ceb3708215971648f74cabfd940995d11b58de3c` | 178.232.033 bytes |
| frontend | `sha256:a08ef8e75d909fd1db597e0d17e0c29a23aebba37dff822907166d4f423ec00e` | 29.836.615 bytes |

Recibo privado no S3: `s3://singflow-manual-build-artifacts-ci8ndzpd8xii/releases/d8e21f5b-2260-412c-b93f-a2fb2aae1a3d/release.zip`. ZIP de 556 bytes, checksum SHA256 `2c372859f654400cd546ab4316431f3abc4d9bdb38cb8cbc49f076a260532d51`, conferido após download. Cópia local validada em [Recibo da versão](releases/0.1.0-beta.1.published.json). Não houve transferência local das imagens Docker; só do recibo pequeno.

Estado: **publicada no ECR, não implantada**. Criar tag/prerelease GitHub e instalar na EC2 são operações seguintes, sujeitas à autorização. Usar o SHA do recibo ao criar `v0.1.0-beta.1`, mesmo que a main avance por documentação; não reconstruir outra revisão com a mesma versão imutável.

## Prerelease GitHub e preparação de implantação

Em 17/11/2026 foi criada e verificada a prerelease [v0.1.0-beta.1](https://github.com/vilabrayner/singflow/releases/tag/v0.1.0-beta.1), com tag no commit `e3350c3def4c30bd3c93bab2d166b50617428190` e recibo `0.1.0-beta.1.published.json` anexado. Não foi feito novo build.

Consultas somente de leitura via SSM confirmaram EC2 `i-0972aeebecab607ba` ligada, três containers em execução, saúde `UP`, 25,41 GiB livres e versão ativa `d7517a724193d1f184c57bf6ca9090ddaab1f10b`. Histórico Flyway até V17, todas bem-sucedidas, e uma sessão com status `OPEN`. Comandos de consulta: `ae249890-bb4d-4289-bd50-ef420ee900bc` e `3fb9d428-1f58-4c75-81be-7d15e5db151c`.

O comando da beta.1 foi preparado em `/private/tmp/singflow-deploy-0.1.0-beta.1.json`, sem executá-lo. A implantação fará backup antes da troca e aplicará V18–V21 no início do backend, incluindo a canonicalização do catálogo na V19. Rollback de imagem não desfaz essas migrations; a versão antiga pode ser incompatível com o novo schema. A execução aguarda aprovação específica, inclusive do momento de interrupção considerando a sessão aberta. Banco, volumes e configurações não serão recriados.

## Implantação confirmada — 17/11/2026

Após autorização específica, o comando SSM `0f8988c7-fd59-4a17-aad6-4c205a8e266f` concluiu com `Success` e código 0, entre 19:17:00 e 19:17:18 (America/Recife). Versão ativa `0.1.0-beta.1`, commit `e3350c3def4c30bd3c93bab2d166b50617428190`, usando os dois digests publicados acima. A tag/prerelease GitHub já identifica o mesmo SHA.

Backup validado pelo instalador: `/opt/singflow/releases/20261117T221703Z-e3350c3def4c/database.dump`. A verificação posterior confirmou arquivo de 107.744 bytes, banco PostgreSQL saudável, configuração preservada e manifest ativo em `/opt/singflow/active-release.json`. Não houve restauração automática de banco ou uso de rollback.

A consulta somente de leitura `3d6280ca-111e-4a65-8285-f643f9d7b1b3` confirmou containers em execução, labels OCI de revisão/versão e imagens por digest iguais ao recibo; histórico Flyway com V1–V21 bem-sucedidas; uma sessão `OPEN` antes e depois. Também confirmou HTTP 200 e `UP` em `/actuator/health` local e pelo domínio público, além das rotas públicas `/anfitriao`, `/musico` e `/admin` com HTTP 200 e entrada Angular. A checagem do domínio público foi feita pela EC2 via HTTPS. O navegador de pesquisa do agente não conseguiu acessar esse endpoint; isso não substituiu a verificação HTTPS efetiva pelo SSM.

Estado atualizado: **publicada no ECR, prerelease GitHub criada e implantada na EC2**. O ensaio manual com login e operações reais fica com o responsável; não foram criados pedidos/convocações nem enviados e-mails de teste pelo agente. Novos logins podem ser necessários após a troca.
