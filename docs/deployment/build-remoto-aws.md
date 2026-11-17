# Build remoto manual e release versionada

Estado em 17/11/2026: infraestrutura autorizada e provisionada, stack `singflow-manual-build` em `CREATE_COMPLETE`. Arquivos publicados na main no commit `f4f84f70e2464bc3de3e10058dad6ff61fdaf0c6`. Duas execuções de build foram realizadas posteriormente e interrompidas pelos testes, antes da publicação. Nenhuma tag/release GitHub ou implantação foi realizada nesta etapa.

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
