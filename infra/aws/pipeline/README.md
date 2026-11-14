# Pipeline nativa AWS do SingFlow

**Estado em 14/11/2026: arquitetura escolhida; proposta não provisionada nem ativada.** A escolha do usuário substitui a proposta GitHub Actions/OIDC. Nenhum recurso foi criado nesta preparação.

## Funcionamento escolhido

GitHub main → CodeConnections (GitHub App) → CodePipeline V2 → CodeBuild (testes, imagens e publicação) → ECR → release desejada → Systems Manager/EC2.

CodePipeline terá execução QUEUED. Um único projeto CodeBuild executará as verificações sequencialmente, construirá e publicará o par de imagens do mesmo SHA e tratará a implantação/pendência. Build falho não muda a release desejada. Imagens por digest, sem latest.

- EC2 ligada: instalador comum atualiza aplicação e verifica saúde.
- EC2 desligada: imagens e intenção ficam persistidas; pipeline registra pendência, sem ligar servidor. Inicialização usa o mesmo instalador e aplica a versão desejada.
- Múltiplas publicações enquanto desligada: instalar a última versão desejada válida.
- Publicação após cada push/merge na main. Uma vez por semana é a previsão de uso; cinco pushes geram cinco execuções.
- O responsável publica fora do karaokê; não implementar bloqueio por sessão aberta nesta versão.
- Preservar PostgreSQL/volumes, arquivos privados, configuração pública da UI, DNS e TLS.
- Deploy pode interromper o app e invalidar logins em memória. Rollback de imagem não desfaz migrations.
- Ativar depois do ensaio do fim de semana; desativar o auto-deploy Hostinger somente nessa etapa aprovada.

O GitHub permanece como repositório. Seus checks existentes podem continuar para PRs; nenhuma função GitHub recebe acesso AWS. A pipeline nativa não depende do resultado de outro workflow para publicar: ela verifica o SHA obtido da fonte.

## Ambiente e evidências

Conta Array of Sunshine 505828739529, perfil singflow-teste, região us-east-2. EC2 i-0972aeebecab607ba; função singflow-trial-core-InstanceRole-gI8jlwKphE9e. Não usar o perfil antigo/root.

GitHub autenticado como vilabrayner; repositório público, main como padrão. IDs confirmados: repository_id 1451667349, owner_id 8032952. Nenhuma chave permanente AWS será colocada no GitHub.

A proposta anterior OIDC ficou limitada por EXPLICIT_DENY da SCP p-eot0a4d1, statement DenyRestrictedFeatures. A avaliação mostrava AdministratorAccess permitindo a ação, mas a SCP a negava. DescribePolicy foi negado; a política integral aplicada não pôde ser lida. A documentação pública da experiência simplificada inclui iam:*Provider* entre as restrições.

A nova escolha não altera SCP nem ativa recursos avançados/plano pago. CodeConnections, CodeBuild e CodePipeline constam entre serviços disponíveis no Free Tier da experiência nova. ListConnections, ListProjects e ListPipelines foram permitidos em Ohio e retornaram listas vazias. Isso **não comprova** autorização para todas as futuras criações e operações.

## Recursos concretos propostos

| Recurso | Quantidade e configuração |
| --- | --- |
| CodeConnections | 1 conexão GitHub, autorizada apenas para vilabrayner/singflow |
| CodePipeline | 1 V2, modo QUEUED, fonte main e ação CodeBuild |
| CodeBuild | 1 projeto, BUILD_GENERAL1_MEDIUM Linux x86-64, 4 vCPU, 7 GB na tabela de preços consultada; timeout 45 min; concorrência 1 |
| ECR | 2 privados: singflow/backend e singflow/frontend; tags imutáveis; AES256; Retain |
| S3 | 1 bucket privado criptografado para artefatos; versionamento; expiração de atuais/não atuais em 7 dias |
| CloudWatch Logs | 1 grupo de build com retenção de 7 dias |
| IAM | 2 funções de serviço (pipeline e build); 1 política adicional à função EC2 existente |
| Parameter Store | 2 Strings sem segredos: desired-release e active-release |
| Documento SSM | 1 comando específico de deploy, sem parâmetros de shell arbitrário |
| EC2 existente | Script comum e serviço systemd de inicialização; nenhum servidor adicional |

CodeBuild será sob demanda, sem VPC, NAT Gateway, capacidade reservada ou Docker image server persistente. Docker privilegiado é necessário para construir imagens e executar PostgreSQL temporário dos testes; não dá acesso ao banco real.

A GitHub App precisa de autorização no navegador. Uma conexão criada por API/CloudFormation permanece PENDING até essa autorização; só prosseguir após AVAILABLE. Não instalar para todos os repositórios.

native-proposal.json registra a proposta de forma estruturada. ecr.json continua cobrindo **apenas os dois ECR**, não a pipeline inteira. Os demais templates, scripts e buildspec ainda serão implementados após a aprovação da etapa correspondente.

## Permissões propostas

- Função pipeline: ler fonte pela conexão e branch/repositório definidos; acessar somente bucket de artefatos; iniciar/consultar apenas o projeto de build.
- Função build: ler artefato, gravar logs no grupo definido, publicar apenas nos dois ECR; ler/gravar apenas o estado de release permitido; consultar EC2 e invocar/acompanhar somente o documento SSM e instância definidos.
- Função EC2: baixar dos dois ECR, ler desired-release e registrar active-release; preservar permissões SSM atuais.
- Sem StartInstances, exclusão de volumes, mudança IAM ou acesso a senhas para a função build.
- GetAuthorizationToken exige Resource *, separado dos ARNs dos dois ECR. Operações sem suporte a escopo de recurso serão documentadas e limitadas por finalidade.
- UseConnection será restrito à conexão/repositório/branch; validar as condition keys suportadas para a ação fonte antes de aplicar.
- SMTP, Last.fm e senha do banco permanecem no backend.env do servidor; não entram em buildspec, manifest, imagem ou logs.
- runtime-config.json é público e precisa ser montado no frontend em cada atualização; a licença não pode se perder com a troca do container.

## Contrato do instalador e da publicação

1. Testar backend/PostgreSQL temporário e frontend antes de publicar.
2. Construir linux/amd64 e confirmar as duas imagens no ECR.
3. Registrar release como par de digests, SHA e origem automática/manual; substituir intenção somente após par completo.
4. Serializar publicações; impedir que uma execução antiga sobrescreva intenção mais recente.
5. Com EC2 parada, concluir como publicado/pendente, nunca como implantado.
6. Instalador adquire flock e relê intenção; baixa as duas imagens antes de interromper containers.
7. Preservar banco e configurações; montar configuração pública do frontend.
8. Checar backend, frontend e saúde; gravar ativa somente após sucesso.
9. Não apagar uma intenção mais recente que chegue durante a instalação.
10. Em falha, registrar resultado e manter configuração/imagens anteriores; rollback somente com schema compatível.
11. Na inicialização, usar o mesmo instalador. Rede/ECR indisponíveis não podem destruir a instalação local.
12. Deploy manual deliberado de versão anterior exige suspender novas execuções automáticas, para evitar sobrescrita concorrente.

Retenção desejada: cinco releases recentes **mais** ativa, anterior e desejada. A política ECR inicial expira apenas imagens sem tag após sete dias. Não aplicar uma regra cega de cinco tags: ela poderia remover a versão ativa enquanto o servidor estiver desligado.

## Estimativa de custo adicional

Consulta em 14/11/2026:
- CodeBuild Linux x86-64 sob demanda general1.medium em Ohio: US$0,01/minuto, confirmado na Price List API com filtros exatos.
- CodePipeline V2: US$0,002 por minuto de execução de ação.
- ECR privado: referência US$0,10/GB-mês.
- S3 e CloudWatch cobrados conforme armazenamento, operações e logs.

Hipóteses: duas ações por execução (fonte de 1 minuto e build com testes/publicação/implantação incluídos no tempo indicado); nenhuma repetição/falha extra. Valores brutos, sem créditos ou franquias:

| Execuções/mês | Minutos de build por execução | CodeBuild | CodePipeline | Total de processamento |
| --- | --- | --- | --- | --- |
| 4 | 20 | US$0,80 | US$0,168 | US$0,968 |
| 5 | 30 | US$1,50 | US$0,310 | US$1,810 |
| 5 | 45 | US$2,25 | US$0,460 | US$2,710 |

ECR entre 1–5 GB: aproximadamente US$0,10–0,50/mês. Planejamento inicial: **US$2–5/mês adicionais**, com pouco armazenamento/logs. Não é limite automático nem garantia. Falhas, novos pushes, reinícios de pipeline e builds maiores aumentam consumo.

Os 100 minutos gratuitos anunciados para CodeBuild general1.small/arm1.small não foram aplicados à estimativa MEDIUM. CodePipeline anuncia 100 minutos de ações V2 gratuitos por mês, compartilhados na conta; também não foram descontados. Confirmar benefícios/créditos efetivamente aplicáveis na cobrança.

Não inclui EC2, disco, IPv4, CloudFront e impostos do ambiente existente. Medir as primeiras execuções e revisar tamanho/tempo; não começar com executor menor apenas para prometer gratuidade.

Fontes: https://aws.amazon.com/codebuild/pricing/ ; https://aws.amazon.com/codepipeline/pricing/ ; https://aws.amazon.com/ecr/pricing/

## Etapas e aprovações restantes

1. Aprovar criação dos recursos/permissões acima e preparar templates/scripts/buildspec verificáveis.
2. Criar a conexão e concluir autorização GitHub App no console; instalar somente no repositório SingFlow.
3. Provisionar demais recursos aprovados com IaC, mantendo gatilho automático desativado.
4. Instalar o atualizador comum e ensaiar deploy controlado.
5. Testar servidor ligado/desligado, boot pendente, falhas de rede/imagem, configuração, concorrência e migrations.
6. Atualizar guias com comandos reais; aprovar ativação automática e desativação do auto-deploy antigo.

A parada automática do ensaio continua em **15/11/2026 às 19:58 America/Recife**. Esta proposta não muda esse prazo nem autoriza ligar/estender a EC2 automaticamente.

## Documentação e validação

Guias: ../../../docs/deployment/pipeline-aws.md e ../../../docs/deployment/deploy-manual-aws.md.

O template ECR passou no cfn-lint 1.51.4, Guard (guardpycfn 0.1.0) e ValidateTemplate do CloudFormation na preparação anterior. São validações de estrutura e controles selecionados, não de toda a pipeline ou permissões de criação. Nenhum stack/change set foi criado na preparação da pipeline.

Referências adicionais: https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html ; https://docs.aws.amazon.com/codepipeline/latest/userguide/connections-github.html

## Preparação local sem ativação - 14/11/2026

Usuário publicou a main f0256da85c73fd7d31b65d9a4cfd9809019337b2, com a correção de lockfile Linux. Docker Desktop disponível no Mac ARM64. Script scripts/aws/release.py e testes preparados: exporta origin/main isolada, constrói linux/amd64, publica em etapa separada e verifica ambos os digests. Nove testes locais passaram sem rede/Docker reais. Nenhum build/push de aplicação foi executado pelo agente nesta preparação.

Buildspec de publicação adicionado como rascunho inativo: infra/aws/pipeline/buildspec-publish.yml. Não há projeto associado nem registro/implantação SSM nele. Não tratar esse arquivo como pipeline completa; instalador, boot e template completo permanecem pendentes.

As tentativas de consulta pelo conector AWS nesta etapa retornaram Unknown tool em duas tentativas. Não foi possível confirmar a existência dos ECR. Não foi criada infraestrutura nem executado push. Roteiro para o responsável: ../../../docs/deployment/primeiro-build-local.md.
