# Primeiro build local da main e envio ao ECR

Preparado em 14/11/2026. **Nenhuma pipeline foi criada/ativada e nenhum build/push real foi executado por esta preparação.** A main confirmada no GitHub é f0256da85c73fd7d31b65d9a4cfd9809019337b2; inclui a correção Linux do lockfile.

## O que está preparado

- scripts/aws/release.py: build de cópia isolada de origin/main e publicação separada no ECR.
- scripts/aws/test_release.py: testes sem AWS/Docker reais para origem, plataforma, conta e falhas de publicação.
- infra/aws/pipeline/ecr.json: cria somente dois repositórios privados; não ativa pipeline.
- infra/aws/pipeline/buildspec-publish.yml: rascunho reutiliza o mesmo script na futura automação. Não está associado a um CodeBuild.
- O instalador EC2/serviço de boot e o template completo da pipeline continuam pendentes. Publicar no ECR **não** muda a aplicação.

O script usa git archive e não faz checkout/reset/stash da sua branch. Inclui somente backend e frontend do commit selecionado em origin/main. Não mistura .env, arquivos locais não versionados ou mudanças pendentes. Cada build recebe uma tag com SHA completo e horário UTC. As duas imagens são linux/amd64, mesmo no Mac Apple Silicon.

## 1. Fazer o build, no terminal da IDE

Docker Desktop deve estar aberto. Python 3.12+ e Git precisam estar disponíveis. Não precisa iniciar backend, frontend ou PostgreSQL locais.

~~~sh
cd /Users/vilabrayner/Documents/GitHub/singflow
python3 scripts/aws/release.py build-main --output /tmp/singflow-release.json
~~~

O script atualiza origin/main, exporta o commit para uma pasta temporária, constrói as duas imagens e verifica plataforma/revisão. Não publica na AWS nem inicia containers de aplicação. Os Dockerfiles compilam com testes desativados no backend; esse comando não substitui as suítes da pipeline. O primeiro build pode demorar pelos downloads e pela emulação amd64 no Mac.

Se o arquivo de saída já existir, escolher outro nome (por exemplo /tmp/singflow-release-2.json). Não sobrescrever o manifest de uma publicação anterior. Se um build falhar, nenhum manifest de sucesso é criado; pode haver camadas/imagens parciais locais.

Ao terminar, o script informa o caminho do manifest. Ele contém apenas metadados e tags, nunca senhas. Para conferir os nomes:

~~~sh
python3 -m json.tool /tmp/singflow-release.json
~~~

Antes de instalar em produção, executar os testes necessários no ambiente de desenvolvimento, conforme os guias do projeto. Não iniciar serviços automaticamente como parte deste roteiro.

## 2. Conferir a conta AWS e os repositórios

Só depois do build, ou em paralelo pelo terminal do responsável. Estes comandos ainda não foram executados pelo agente nesta etapa, pois o conector AWS retornou ferramenta indisponível.

~~~sh
aws sts get-caller-identity --profile singflow-teste --region us-east-2
aws ecr describe-repositories --profile singflow-teste --region us-east-2 --repository-names singflow/backend singflow/frontend --query 'repositories[].{name:repositoryName,uri:repositoryUri,immutable:imageTagMutability}'
~~~

Account deve ser 505828739529. Não usar perfil antigo/root. Se a sessão expirou, renovar o login com o perfil/região corretos; não colar tokens na conversa.

Se os repositórios não existirem, criar **somente os dois ECR** com o template existente, depois de revisar o custo e confirmar o resultado proposto. Armazenamento tem referência de US$0,10/GB-mês; isso não cria EC2, CodeBuild ou CodePipeline. Alternativa via console: CloudFormation em Ohio → Create stack → Upload template → infra/aws/pipeline/ecr.json → nome singflow-ecr → RepositoryPrefix singflow → revisar dois ECR → criar. Se nomes já existirem fora de um stack, não duplicar nem excluir: revisar e reutilizar/importar conforme a propriedade atual.

Comando equivalente para o responsável, **somente quando a criação estiver autorizada**:

~~~sh
aws cloudformation deploy --profile singflow-teste --region us-east-2 --stack-name singflow-ecr --template-file infra/aws/pipeline/ecr.json
~~~

O template usa tags imutáveis, AES256, Retain e expiração de imagens sem tag após sete dias. Nenhuma imagem com tag é apagada pela regra inicial.

## 3. Publicar as imagens, separado do build

Com conta e repositórios conferidos:

~~~sh
python3 scripts/aws/release.py publish --manifest /tmp/singflow-release.json
~~~

O script valida:
- conta/região esperadas e identidade que não seja root;
- ambas as imagens locais, arquitetura amd64 e label do mesmo commit;
- nomes dos dois repositórios e imutabilidade;
- conteúdo confirmado no ECR depois de cada envio.

A senha temporária do ECR é obtida em memória e passada ao Docker pelo stdin; não é exibida. O Docker usa seu armazenamento de credenciais configurado. O script não imprime o ambiente privado.

Se um push falhar depois do primeiro, ainda não existe publicação completa. Corrigir a causa e repetir publish com o mesmo manifest: uma tag já existente só é reutilizada se o config digest corresponde à imagem local. Tags diferentes não são sobrescritas. Manifest de imagem multi-plataforma não reconhecido é rejeitado; este primeiro fluxo usa imagem única amd64, sem attestations de provenance/SBOM, para permitir conferência direta do config digest.

Só depois de confirmar as duas imagens, cria /tmp/singflow-release.published.json. Se o recibo já existir, inspecioná-lo em vez de repetir/sobrescrever. Nenhuma tarefa SSM de implantação é chamada e nenhuma intenção de release é alterada.

## 4. Conferir o resultado

Console AWS → região Ohio → ECR → Private repositories → singflow/backend e singflow/frontend → Images. Conferir as tags/digests do recibo.

O app atual não muda ao enviar imagens. A instalação na EC2 será outra etapa, usando o instalador comum que ainda será implementado e revisado. Não executar trial/start.sh para atualizar: ele é de instalação inicial e inclui criação de banco/containers.

## Automação preparada, ainda sem uso

O buildspec está fora de .github/workflows e não dispara no GitHub. Não existe projeto AWS ligado a ele. A futura automação deverá:
- usar imagem CodeBuild com Java 21/Node compatível (validar imagem gerenciada antes de criar);
- usar Docker privilegiado para build e banco temporário de testes;
- executar as suítes antes de build/push e manter os arquivos privados fora das imagens;
- passar profile vazio ao script publish para usar a função de serviço, sem perfil pessoal;
- adicionar o registro da intenção e a instalação/pendência, que ainda não fazem parte deste buildspec;
- permanecer desativada até aprovação do primeiro ensaio e da ativação.

Não subir templates de pipeline nem autorizar GitHub App para este primeiro envio manual. O objetivo inicial é apenas construir e armazenar imagens.

A parada do ensaio AWS em 15/11 às 19:58 America/Recife continua inalterada.
