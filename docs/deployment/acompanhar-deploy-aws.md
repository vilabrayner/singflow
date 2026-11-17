# Publicação manual e acompanhamento pelo console AWS

Conta: Array of Sunshine, `505828739529`. Região: Ohio, `us-east-2`.

## Onde acompanhar

- **ECR**: https://us-east-2.console.aws.amazon.com/ecr/private-registry/repositories?region=us-east-2
  - Abra `singflow/backend` ou `singflow/frontend`, depois **Images**.
  - A tag identifica a versão construída; o digest `sha256` identifica o conteúdo exato.
  - Ter uma imagem no ECR significa que ela está armazenada, não que está em execução.
- **Systems Manager / Run Command**: https://us-east-2.console.aws.amazon.com/systems-manager/run-command/commands?region=us-east-2
  - **Command history** → clique no ID do comando.
  - **Targets and outputs** → selecione a instância → **View output**.
  - Expanda **Step 1 / Output** para ver as etapas. Atualize enquanto estiver em andamento; a saída pode aparecer com atraso ou somente ao terminar o comando.
  - `PREFLIGHT`: confere destino, containers e configurações.
  - `DOWNLOAD`: baixa e verifica as duas imagens antes de interromper o app.
  - `BACKUP`: interrompe as escritas do app e faz um dump do PostgreSQL.
  - `INSTALL`: troca os containers e espera a saúde do backend/frontend.
  - `SUCCESS`: verificação local concluída e versão ativa registrada.
  - `ROLLBACK`: tentativa de restauração dos containers anteriores após falha. Conferir o resultado final e a saúde pública.
- **EC2**: https://us-east-2.console.aws.amazon.com/ec2/home?region=us-east-2#InstanceDetails:instanceId=i-0972aeebecab607ba
  - Mostra a máquina, estado e verificações da infraestrutura. Não identifica sozinho a versão do app.
- **CloudFormation**: https://us-east-2.console.aws.amazon.com/cloudformation/home?region=us-east-2#/stacks
  - `singflow-ecr`: os dois repositórios privados.
  - `singflow-ec2-ecr-pull`: permissão da função atual da EC2 para baixar somente as imagens desses dois repositórios, com autenticação ECR restrita a Ohio.

A pipeline automática continua inativa. Esta implantação manual aparece no Run Command, não no CodePipeline.

## Repetir uma publicação manual

Execute no terminal da IDE, na raiz do repositório, com Docker Desktop aberto. Use caminhos de manifesto novos para cada versão: os scripts recusam sobrescrever comprovantes existentes.

```bash
python3 scripts/aws/release.py build-main --output /tmp/singflow-proxima-release.json
python3 scripts/aws/release.py publish --manifest /tmp/singflow-proxima-release.json
```

O primeiro comando constrói `origin/main` e o segundo envia ao ECR. Nenhum deles atualiza a EC2.

Após revisar a versão que será implantada e confirmar que é um momento adequado para breve interrupção, prepare o comando de implantação:

```bash
python3 -B scripts/aws/prepare-deploy.py \
  --manifest /tmp/singflow-proxima-release.published.json \
  --output /tmp/singflow-proximo-deploy.json
```

Isso gera somente um arquivo JSON local. Para executar de fato na EC2:

```bash
aws ssm send-command \
  --profile singflow-teste \
  --region us-east-2 \
  --cli-input-json file:///tmp/singflow-proximo-deploy.json \
  --query 'Command.CommandId' \
  --output text
```

Guarde o ID retornado e acompanhe-o no Run Command, conforme as instruções acima. Confira também:

```bash
curl -fsS https://singflow.flowave.tec.br/actuator/health
```

O resultado esperado é `status: UP`. Teste login e um fluxo do app depois da atualização. As sessões de login podem exigir nova autenticação.

## O que o procedimento preserva

O script `scripts/aws/deploy-ec2.py` executa como root na instância aprovada, com bloqueio contra duas implantações simultâneas. Exige que os três containers estejam em execução; não liga uma EC2 parada. Este procedimento manual não implementa publicação pendente para o próximo boot.

As imagens são baixadas por digest, verificando arquitetura `linux/amd64` e o mesmo commit nas duas imagens. O backend reutiliza `/opt/singflow/backend.env`. O frontend monta `/opt/singflow/runtime-config.json` em `/usr/share/nginx/html/config.json`, preservando a configuração pública e a licença da UI. O volume PostgreSQL não é recriado nem apagado.

Após interromper as escritas do app, o procedimento salva um dump e cópias das configurações em `/opt/singflow/releases/<data>-<commit>/`. Essa pasta é privada e permanece no disco criptografado da EC2; não é um backup externo. Os arquivos de ambiente e o dump nunca devem ser enviados ao repositório ou exibidos em logs.

Os containers anteriores ficam parados, com nomes `backend-previous-<data>` e `frontend-previous-<data>`. A versão ativa, os nomes anteriores e o caminho do backup ficam em `/opt/singflow/active-release.json`.

Se a troca falhar antes da conclusão, o script tenta voltar aos containers anteriores e verifica a saúde. O banco nunca é restaurado automaticamente: migrations podem exigir análise de compatibilidade e restauração manual. Não executar `infra/aws/trial/start.sh` para atualizar: ele é um provisionamento inicial.

## Primeira implantação pelo ECR

- Data: 14/11/2026, das 11:38:58 às 11:39:23, horário de Recife.
- Commit: `d7517a724193d1f184c57bf6ca9090ddaab1f10b`.
- Comando SSM: `b953dbff-4e56-42cc-b115-6ff36f3e8db5`, `Success`, código 0.
- Backup: `/opt/singflow/releases/20261114T143906Z-d7517a724193`.
- Saúde local e pública: `UP` após a troca.
- PostgreSQL já estava na V17; não foi adicionada migration por essa release.
- Nenhum commit/push ou ativação da pipeline realizado pelo agente.

O template versionável `infra/aws/pipeline/ec2-ecr-pull.json` registra a permissão autorizada para a função já existente da EC2. Não substitui o instance profile ou sua trust policy, nem remove os acessos anteriores a SSM e ao artefato inicial.
