# Pipeline nativa AWS do SingFlow

**Estado: arquitetura escolhida e proposta documentada; não provisionada nem ativa.** Ver ../../infra/aws/pipeline/README.md para recursos, custos e aprovações. Os workflows GitHub atuais não foram alterados.

## Termos usados

| Termo | Função |
| --- | --- |
| GitHub | Guarda o código e os commits |
| CodeConnections | Conecta a AWS ao repositório usando GitHub App |
| CodePipeline | Organiza e acompanha as etapas da publicação |
| CodeBuild | Máquina temporária para executar testes e construir imagens |
| Dockerfile / imagem / container | Receita / pacote da versão / aplicação executando |
| ECR | Guarda as imagens Docker privadas |
| Tag / digest | Nome da versão / identificação exata do conteúdo |
| EC2 | Servidor que executa o app e o banco |
| Systems Manager (SSM) | Executa a tarefa de implantação na EC2 sem abrir SSH |
| Release desejada / ativa | Versão publicada para instalar / versão verificada no servidor |
| Flyway | Aplica novas migrations no banco |

## Fluxo escolhido

Push/merge na main → CodeConnections → CodePipeline → CodeBuild testa frontend/backend → constrói e publica imagens no ECR → registra release desejada → implanta se EC2 ligada ou deixa pendente se desligada.

O build acontece na infraestrutura temporária do CodeBuild, não na EC2 do karaokê nem no GitHub Actions. Continua fora do servidor da aplicação. Só haverá publicação após testes aprovados para o mesmo commit das imagens.

Uma publicação semanal é previsão de uso, não agendamento ou limitação: cada push na main dispara uma execução após a ativação. Commit local sem push não dispara. A pipeline será QUEUED; não ativar execuções paralelas independentes sobre o mesmo servidor.

Os checks GitHub existentes podem continuar para feedback de PRs. Eles não recebem acesso AWS e não substituem os testes da pipeline nativa.

## Acompanhar quando estiver ativa

Console AWS → região Ohio → CodePipeline → singflow-production → execução. Conferir commit e ações Source e VerifyBuildPublishDeploy. Abrir o build correspondente no CodeBuild para logs e os resultados de testes.

- Publicado: ambas as imagens foram confirmadas no ECR.
- Pendente: release desejada persistida; servidor desligado. Isso não é implantação concluída.
- Implantado: instalador terminou e verificou saúde/frontend.
- Falhou: consultar tarefa SSM e build; não imprimir variáveis privadas nos logs.

Pipeline e projeto acima ainda não existem. A autorização GitHub App também exige conclusão no navegador: conexão PENDING não acessa o código até virar AVAILABLE.

## Regras operacionais

- Publicar fora do karaokê; pode haver breve interrupção e novo login.
- Não ligar EC2 automaticamente. Boot aplica a última release desejada válida.
- Não recriar PostgreSQL nem apagar seus volumes.
- Preservar backend.env; montar runtime-config.json no novo frontend.
- Baixar duas imagens por digest antes de interromper a versão atual.
- Ativar nova release somente após verificações.
- Rollback de imagem depende de compatibilidade com o schema; não desfaz Flyway.
- Retenção protege ativa/anterior/desejada além das cinco releases recentes.
- Não alterar SCP/plano da conta para esta alternativa.
- Auto-deploy Hostinger será desativado somente na ativação autorizada.

## Falhas comuns

| Sintoma | Verificar |
| --- | --- |
| Push não iniciou execução | Gatilho já ativo? main? conexão AVAILABLE? |
| Fonte não acessa repositório | GitHub App autorizada para SingFlow e política UseConnection |
| Build falhou | Testes, dependências, memória, timeout, daemon Docker e logs |
| Imagem não publicada | Permissões ECR, autenticação temporária e tag imutável já existente |
| Publicou mas não implantou | EC2 desligada, SSM offline ou diferença entre desejada/ativa |
| Boot manteve imagem anterior | Rede/ECR/instalador; não tratar pendência como sucesso |
| Health falhou | Backend, banco e migrations; não resetar banco |
| UI perdeu configuração | Montagem do arquivo público runtime-config.json |
| Manual foi sobrescrito | Pipeline não foi suspensa ou intenção desejada ficou desatualizada |

## Antes de ativar

Ensaiar testes falhos, par incompleto de imagens, duas publicações, servidor desligado, atualização no boot, falha de rede, health falho, preservação de configuração/banco e rollback compatível/incompatível. Não executar migrations no banco real como teste de pipeline.

O guia de deploy manual está em deploy-manual-aws.md. Comandos definitivos do instalador serão documentados quando implementados e testados.

A parada automática do ensaio continua em 15/11/2026 às 19:58 America/Recife; esta preparação não estende a operação.
