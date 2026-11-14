# Teste AWS do SingFlow

Teste aprovado por até 48 horas em 13/11/2026, para comparar latência com Hostinger/Render/Aiven. Banco novo; nenhum dado de produção foi migrado. Não tratar esta topologia como arquitetura final de produção.

## Ambiente publicado

- Conta Array of Sunshine: `505828739529`; perfil `singflow-teste`; região `us-east-2`.
- Aplicação: https://singflow.flowave.tec.br/anfitriao
- Diagnóstico AWS: https://d3bqze3e19upe4.cloudfront.net
- CloudFront: `ENO1YFRRQHZ3F`; VPC origin: `vo_72E3ZTMrhsGF545q1pa8QU`.
- EC2: `i-0972aeebecab607ba`, `c7i-flex.large`, 2 vCPU/4 GiB; disco gp3 criptografado de 30 GB.
- Stacks CloudFormation em Ohio: `singflow-trial-core` e `singflow-trial-edge`.
- Aplicação Docker em `/opt/singflow`: frontend Nginx, Java 21 e PostgreSQL 17.6 no mesmo servidor.
- Base do código: commit `4af0615f94735bbc3e7a5396df84b5f9c308b085`, com correção mínima de duas entradas ausentes do lockfile e configuração pública de UI aplicada em runtime. Sem commit ou push pelo agente.
- As credenciais são novas, geradas no servidor, diferentes da produção. Não estão neste documento ou nos templates.
- Integrações configuradas em 14/11/2026: Last.fm com chave privada e SMTP Hostinger (smtp.hostinger.com:587, STARTTLS, usuário/remetente contato@flowave.tec.br). Valores sensíveis ficam no arquivo privado de ambiente do servidor, não no repositório. A senha preenchida no .env.example foi removida e movida ao .env privado.
- Last.fm validado pelo endpoint público: 10 resultados com origem LASTFM. SMTP validado por STARTTLS e autenticação a partir da EC2; nenhum e-mail enviado automaticamente. A entrega real deve ser conferida no fluxo de cadastro/confirmacão. A configuração Gmail local inicialmente identificada foi removida da AWS antes da configuração Hostinger.
- A licença pública de UI existente foi reaproveitada; API do frontend permanece em `/api`.

## Segurança e custo

Acesso administrativo via Systems Manager; sem SSH público. Backend e banco não têm portas publicadas no host. A porta 80 admite apenas a lista gerenciada de origens CloudFront; CloudFront usa o endereço privado da instância. HTTPS é terminado no CloudFront e o trecho CloudFront/origem usa HTTP dentro da VPC.

IMDSv2 obrigatório, disco criptografado, cookies de sessão seguros no perfil `prod`, CSRF preservado. Cache CloudFront desativado para todas as respostas neste teste; cookies, headers de autenticação/CSRF e query strings são encaminhados. Logs CloudFront em bucket privado criptografado com expiração de sete dias, sem cookies. Não compartilhar logs brutos: caminhos e query strings podem conter dados de acesso.

A função EC2 tem `AmazonSSMManagedInstanceCore` e leitura apenas de `source/*` no bucket privado de artefatos. O aplicativo não recebe chaves AWS. Os artefatos de código não contêm arquivos `.env`.

Base estimada: US$0,08479/h de EC2 + US$0,005/h de IPv4 + US$2,40/mês de disco, cerca de US$2,23/24h ou US$4,47/48h. S3/logs e tráfego variável são adicionais. CloudFront tem franquia mensal de 1 TB e 10 milhões de requisições; confirmar consumo/créditos na cobrança. O crédito confirmado era US$100; não há garantia de gasto máximo automático.

Parada automática do sistema agendada para **15/11/2026 às 19:58, America/Recife**. Não é encerramento da instância: o disco continua cobrado e os dados permanecem. O domínio fica indisponível com a EC2 parada se o DNS não for revertido antes. Ao reiniciar a EC2, revisar IP público e agendamento; não assumir que o timer de shutdown sobrevive a reinicializações.

## Certificado e DNS

ACM: `arn:aws:acm:us-east-1:505828739529:certificate/33af7fd5-1e54-4a72-91a0-817760b3a99e`, emitido e aplicado ao CloudFront com TLS 1.2 ou superior.

O CloudFormation em `us-east-1` foi negado por SCP desta conta simplificada. O ACM nessa região permitiu a emissão diretamente; por isso o certificado é um recurso externo ao stack de Ohio, passado pelo parâmetro `CertificateArn`. O template `certificate.json` fica como referência, mas **não foi implantado** nesta conta. Não tentar remover a restrição regional ou ativar recursos avançados sem autorização.

DNS no Hostinger, zona `flowave.tec.br`:
- Registro `singflow`, tipo ALIAS, TTL 300: `d3bqze3e19upe4.cloudfront.net.`.
- Registro CNAME de validação ACM adicionado sem sobrescrever os demais registros.
- MX, SPF, DKIM, DMARC, domínio principal, `www`, `www.singflow` e FTP preservados.
- Snapshot imediatamente anterior ao apontamento: `196857426`, de 13/11/2026 23:07:21 UTC.

## Reversão

Antes da parada do teste, restaurar somente o registro `singflow`:
- ALIAS, TTL 300, destino `singflow.flowave.tec.br.cdn.hstgr.net.`.

Validar HTTPS, frontend e API após a propagação. O ambiente Hostinger/Render/Aiven foi preservado. Não restaurar a zona inteira por padrão: isso pode apagar alterações legítimas feitas depois do snapshot. Não excluir buckets, disco, volumes ou certificado sem autorização específica. Os recursos com Retain e o disco preservado exigem limpeza explícita; apagar stacks não garante custo zero.

## Operação

Console da instância: https://us-east-2.console.aws.amazon.com/ec2/home?region=us-east-2#InstanceDetails:instanceId=i-0972aeebecab607ba

Para acessar pelo console: EC2 > Connect > Session Manager. Os arquivos de configuração em `/opt/singflow` têm permissão restrita a root. O acesso temporário pode ser consultado pelo responsável no terminal da sessão com `sudo cat /opt/singflow/test-access.txt`; não colar o resultado em chats ou logs.

A senha foi entregue também em arquivo local temporário com permissão 0600, por transferência criptografada; o texto não foi exibido em ferramentas nem no chat. Apagar esse arquivo após o teste.

Os scripts `build.sh` e `start.sh` registram a implantação inicial específica deste teste; `start.sh` não é um comando de atualização e não deve ser repetido com containers existentes. Não substituir arquivos de credenciais para reiniciar serviços. Verificar containers com `sudo docker ps`, saúde com `curl -fsS http://127.0.0.1/actuator/health`.

## Validação realizada

- cfn-lint 1.51.4: templates core, certificado e edge. Aviso W3045 do ACL legado de logs avaliado: necessário para a entrega de logs CloudFront usada neste teste.
- Guard via guardpycfn 0.1.0: regras locais para buckets privados/criptografados, IMDSv2, disco criptografado e ausência de CIDRs públicos no ingress. Isso não equivale a uma auditoria completa.
- Validação de serviço CloudFormation e change sets antes das mudanças principais. Sem trail durável encontrado na consulta de Ohio; Event History oferece auditoria limitada a 90 dias. Não foi criado trail adicional.
- Builds Docker de backend e frontend concluídos; frontend executou `npm ci` após a correção mínima do lockfile.
- Fluxo interno: login, criar/abrir sessão, cadastrar três participantes, adicionar música, consultar fila, convocar, concluir, conferir domínio do QR e encerrar a sessão: PASS.
- Fluxo pela URL HTTPS pública AWS: PASS. Três POSTs para adicionar música levaram 249,7 / 256,0 / 257,0 ms; chamadas sem incluir o GET de CSRF anterior. Base pequena e nova; não é comparação controlada com produção nem prova de causa única da lentidão anterior.
- Health público AWS e health do domínio customizado: HTTP 200 / UP; certificado customizado validado antes do apontamento.
- Sessões criadas pelos testes automáticos foram encerradas. Dados de teste permanecem para auditoria.

## Atualização das integrações

Transferência dos parâmetros feita com criptografia de envelope; somente ciphertext passou pelo bucket de artefatos. Chaves e arquivos temporários de transferência foram removidos após aplicação. O backend foi recriado mantendo imagem, rede, limites e parâmetros do banco; PostgreSQL e seus volumes foram preservados. Após a aplicação, health retornou UP. A parada automática e o roteiro de reversão do teste continuam válidos.
