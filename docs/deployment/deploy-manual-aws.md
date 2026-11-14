# Deploy manual AWS do SingFlow

Este guia separa **o que já funciona no ensaio** do **procedimento ECR planejado**. A automação escolhida é nativa AWS. Publicar imagens da sua máquina e usar o instalador comum não dependerá de GitHub Actions nem de CodePipeline. Não execute os exemplos de ECR antes de criar e autorizar a infraestrutura descrita em ../../infra/aws/pipeline/README.md.

## Antes de começar

Fazer a atualização fora do karaokê. Confirmar conta 505828739529 e região us-east-2; o perfil é singflow-teste, não o antigo singflow/root. O app atual está em https://singflow.flowave.tec.br.

No Mac, pré-requisitos para publicar imagens: Git, Docker com suporte linux/amd64 e AWS CLI com login do responsável. Não gravar access keys no repositório. O Docker local é iniciado pelo responsável.

Identificar versão ativa, imagens anteriores e migrations novas; fazer backup do banco antes de alteração de esquema. Não usar os scripts trial/start.sh e trial/build.sh como atualização: eles são específicos da instalação inicial.

## Acesso atual ao servidor

Console AWS → EC2 → região Ohio → instância i-0972aeebecab607ba → Connect → Session Manager. O terminal abre no servidor, não no seu Mac.

Comandos de consulta disponíveis hoje:

~~~sh
sudo docker ps
sudo docker image ls
curl -fsS http://127.0.0.1/actuator/health
sudo docker inspect --format '{{.Config.Image}} {{.Image}}' backend frontend
~~~

backend.env e postgres.env contêm segredos. Não imprimir, compartilhar ou colocar em commit. runtime-config.json é a configuração pública da interface e precisa continuar presente em novas versões.

## Publicar uma imagem no ECR, após a preparação

Os comandos abaixo são para executar no Mac, na raiz do repositório. Servem de referência até os repositórios e as permissões serem provisionados. Nenhum deles foi executado por esta preparação.

~~~sh
aws login --profile singflow-teste --region us-east-2
aws sts get-caller-identity --profile singflow-teste --region us-east-2

TRIAL_ACCOUNT=505828739529
TRIAL_REGION=us-east-2
TRIAL_REGISTRY=505828739529.dkr.ecr.us-east-2.amazonaws.com
~~~

Confirmar que Account é 505828739529 antes de publicar. Usar uma cópia limpa do commit desejado; uma tag com SHA não pode representar mudanças locais escondidas.

Escolher um identificador de release único e anotá-lo, por exemplo manual-COMMITCOMPLETO-DATAHORA. Substituir os placeholders; não usar latest. Usar o mesmo identificador nas duas imagens. O identificador manual deve registrar o commit e a origem manual.

~~~sh
TRIAL_RELEASE=SUBSTITUIR_POR_RELEASE_UNICA

aws ecr get-login-password --profile singflow-teste --region us-east-2 |
  docker login --username AWS --password-stdin "$TRIAL_REGISTRY"

docker buildx build --platform linux/amd64 --load   -t "$TRIAL_REGISTRY/singflow/backend:$TRIAL_RELEASE" ./backend
docker buildx build --platform linux/amd64 --load   -t "$TRIAL_REGISTRY/singflow/frontend:$TRIAL_RELEASE" ./frontend

docker push "$TRIAL_REGISTRY/singflow/backend:$TRIAL_RELEASE"
docker push "$TRIAL_REGISTRY/singflow/frontend:$TRIAL_RELEASE"
~~~

ECR exige login temporário também no computador do responsável. Não colocar SMTP, Last.fm ou senhas como build args. A licença/configuração pública do frontend será montada em runtime no servidor.

Consultar e anotar os dois digests, que identificam os conteúdos publicados:

~~~sh
aws ecr describe-images --profile singflow-teste --region us-east-2   --repository-name singflow/backend --image-ids imageTag="$TRIAL_RELEASE"   --query 'imageDetails[0].imageDigest' --output text
aws ecr describe-images --profile singflow-teste --region us-east-2   --repository-name singflow/frontend --image-ids imageTag="$TRIAL_RELEASE"   --query 'imageDetails[0].imageDigest' --output text
~~~

Se a tag já existir, não apagá-la nem habilitar sobrescrita para repetir build. Selecionar outra release única ou reutilizar a imagem existente conscientemente.

## Implantar uma release publicada

**Ainda falta implementar o comando comum de implantação.** Não existe hoje um comando singflow deploy nem um documento SSM customizado pronto. A versão final deste guia terá o comando real, depois de testado.

O instalador manual deverá:
1. Validar o par de digests nos dois ECR e registrar origem manual.
2. Atualizar a mesma versão desejada usada pela pipeline.
3. Se EC2 desligada, registrar pendência e terminar sem ligá-la.
4. Se ligada, chamar o documento SSM específico e acompanhar até concluir.
5. Baixar ambas as imagens antes de parar a aplicação.
6. Preservar banco/configurações; montar runtime-config.json no frontend e reutilizar backend.env.
7. Verificar ambos os containers, saúde e rota frontend; registrar versão ativa.
8. Reler a intenção ao final para não perder atualização concorrente.

Antes de usar rollback manual, suspender novas publicações da pipeline. Não alterar diretamente apenas os containers enquanto a versão desejada ainda aponta para outra release: na próxima inicialização ela poderia ser reinstalada.

## Verificar o resultado

Após o deploy implementado, conferir:

~~~sh
curl -fsS https://singflow.flowave.tec.br/actuator/health
~~~

Entrar no app com sua conta, conferir a versão registrada, criar uma sessão de ensaio, incluir participante e música, convocar e concluir. Conferir geração do QR, busca Last.fm e entrega de e-mail por uma ação explicitamente solicitada. Não enviar mensagens de teste automaticamente sem definir destinatário.

Health UP sozinho não comprova entrega SMTP ou todas as funcionalidades.

## Voltar à versão anterior

Selecionar o par de digests anterior registrado e verificar se o esquema atual aceita essa versão. A reversão usa o mesmo instalador e também atualiza a intenção persistida.

- Nunca apagar o banco para fazer downgrade.
- Nunca editar migration Flyway já aplicada nem executar repair para ocultar incompatibilidade.
- Se a migration for incompatível, parar e planejar correção ou restauração de backup com autorização; não prometer rollback automático.
- Falha durante deploy não pode destruir imagens/configurações anteriores.

## Limites do ensaio

A parada automática permanece em 15/11 às 19:58 America/Recife. Antes disso, decidir continuidade ou reverter DNS conforme ../../infra/aws/trial/README.md. Este guia não aumenta o prazo nem liga o servidor automaticamente.

## Alternativa: iniciar a pipeline AWS manualmente

Depois de provisionada e ativada: console AWS → Ohio → CodePipeline → singflow-production → Release change. Isso executa a pipeline AWS para a revisão da fonte; não requer GitHub Actions nem um novo commit para republicar uma revisão já existente. Conferir a revisão selecionada e a política de tags antes de repetir uma publicação: tags imutáveis não podem ser sobrescritas. O comportamento de reutilização de imagens da mesma revisão ainda será implementado e testado.

Esse botão continua usando testes e build CodeBuild e gera consumo. Para instalar diretamente uma release que já está no ECR, usar o futuro instalador comum/manual descrito acima, sem acionar CodePipeline. Não confundir essas duas operações.

## Primeiro build local guiado

Os comandos de build isolado da main e push separado agora estão preparados em [primeiro-build-local.md](primeiro-build-local.md). O script scripts/aws/release.py não cria repositórios, não inicia aplicação nem implanta na EC2. A pipeline continua inativa; instalador/boot continuam pendentes.
