# Cadastros, confirmação e administração

## Escopo e regras

- Novas contas de anfitrião e músico informam nome, e-mail e senha (12 caracteres ou mais, até 72 bytes UTF-8). A confirmação de senha é feita na interface.
- Fluxo: cadastro → confirmação do e-mail → aprovação administrativa → acesso ao painel. Confirmar o e-mail não aprova o cadastro automaticamente.
- Os dois tipos usam o mesmo fluxo. O vínculo do músico a uma sessão continua sendo uma autorização adicional dada pelo anfitrião.
- Contas que existiam antes da V12 continuam aprovadas e com e-mail considerado confirmado, preservando sessões, músicas e acessos existentes.
- A permissão administrativa é adicional ao perfil atual. Não há cadastro público nem botão para conceder ADMIN.
- `/admin` é acessada diretamente e não aparece nos menus públicos. Todas as APIs administrativas exigem permissão administrativa no backend.
- Cadastro pendente, rejeitado ou suspenso pode autenticar com sua senha para consultar `/conta`, mas não pode acessar as APIs dos painéis.
- A situação e as permissões são consultadas novamente em cada requisição protegida. Suspender uma conta bloqueia também as chamadas seguintes de quem já está conectado. Desmarcar ADMIN no banco remove o acesso das sessões antigas.
- Aprovação exige e-mail confirmado. Rejeição só se aplica a pendentes; suspensão a aprovados. Cadastro rejeitado com e-mail já confirmado e cadastro suspenso podem ser aprovados novamente. Uma rejeição anterior à confirmação impede o uso do link de confirmação.
- Rejeição e suspensão exigem motivo. Contas administrativas são protegidas contra bloqueio por esse painel. O histórico registra autor, data, ação e motivo.
- As decisões usam bloqueio de linha e versão do cadastro: duas decisões sobre a mesma versão não podem sobrescrever uma à outra silenciosamente.
- A listagem tem filtros de nome/e-mail, perfil e situação, com paginação de 25 registros. O detalhe mostra as últimas 100 ocorrências de auditoria.
- Não há exclusão de contas, troca de perfil, recuperação de senha nem gestão de catálogo neste incremento.

## Confirmação e envio

O backend usa SMTP pelo `JavaMailSender`. O link vale 24 horas e uma única utilização. Somente o hash SHA-256 do token é persistido; o token original aparece apenas no e-mail. O token segue no fragmento da URL (`/confirmar-email#token=...`), é removido da barra ao abrir e só é enviado à API após o botão **Confirmar e-mail**. Apenas abrir a página não consome o link.

O reenvio substitui o token anterior e tem intervalo mínimo de um minuto, além de limites por endereço de e-mail e origem da requisição. A resposta não informa se o e-mail existe. Sem configuração de envio, novos cadastros e reenvios retornam indisponibilidade; o acesso das contas existentes permanece funcionando. Falha de SMTP durante o cadastro reverte a criação da conta e do token. Se houver falha de commit depois de uma entrega SMTP, o link pode não ser válido e o usuário deve repetir o cadastro/reenvio. O envio é síncrono, com tempos de espera limitados; não há fila de entrega nem tentativas automáticas neste incremento.

O SMTP é opcional para o startup e não participa do healthcheck, pois uma falha no e-mail não deve derrubar os painéis já em uso. Validar entrega ao configurar o provedor. Não registrar senhas SMTP ou URLs de confirmação em logs.

## Primeiro administrador

No backend, configurar:

```dotenv
SINGFLOW_ADMIN_EMAIL=vilabrayner@gmail.com
```

O `.env` local já recebeu essa opção. No Render, adicioná-la manualmente às variáveis do backend. A conta precisa existir, estar aprovada e com e-mail confirmado. O startup concede a permissão de forma idempotente e registra `ADMIN_GRANTED`, preservando perfil e senha. Uma configuração inválida interrompe o startup com mensagem de configuração, sem criar uma conta silenciosamente.

Após conceder, remover a variável do ambiente evita que uma revogação administrativa futura seja desfeita em outro startup. Remover a variável não revoga a permissão já concedida. Não alterar migrations antigas nem cadastrar senha padrão de administrador.

## Caixa local de testes

Os serviços continuam sob controle do responsável no terminal da IDE. Para iniciar apenas a caixa de e-mail:

```sh
docker compose -f compose.mailpit.yaml up -d
```

No `.env` da raiz (backend local), configurar:

```dotenv
SINGFLOW_SMTP_HOST=127.0.0.1
SINGFLOW_SMTP_PORT=1025
SINGFLOW_SMTP_USERNAME=
SINGFLOW_SMTP_PASSWORD=
SINGFLOW_SMTP_AUTH=false
SINGFLOW_SMTP_STARTTLS=false
SINGFLOW_MAIL_FROM=SingFlow <acesso@singflow.test>
```

Executar `SingflowApplicationLocal` pela IDE para aplicar essas opções e a V12. Abrir a caixa em `http://127.0.0.1:8025`. Ela não entrega mensagens para a internet. Para testar pelo celular, usar os links enviados com `SINGFLOW_PUBLIC_APP_URL` apontando para o frontend acessível no aparelho (a classe local continua detectando o IP da máquina).

No stack Docker, usar `SINGFLOW_SMTP_HOST=host.docker.internal` para alcançar a caixa publicada no host no Docker Desktop; o Compose principal repassa as variáveis de SMTP e administração. Para encerrar a caixa:

```sh
docker compose -f compose.mailpit.yaml down
```

## Produção

Configurar no Render `SINGFLOW_MAIL_FROM`, `SINGFLOW_SMTP_HOST`, `SINGFLOW_SMTP_PORT`, `SINGFLOW_SMTP_USERNAME`, `SINGFLOW_SMTP_PASSWORD`, `SINGFLOW_SMTP_AUTH=true` e `SINGFLOW_SMTP_STARTTLS=true`, conforme o provedor. Manter as credenciais somente no backend. Manter `SINGFLOW_PUBLIC_APP_URL=https://flowavesingflow.netlify.app` para os links chegarem ao frontend certo.

O envio real ainda depende da escolha e configuração de um provedor e de remetente autorizado. **Render Free bloqueia saída nas portas SMTP 25, 465 e 587**. Se estiver nesse plano, esta integração precisa de porta alternativa permitida e suportada pelo provedor ou de um adaptador de API HTTPS. Não desabilitar TLS para contornar essa limitação. Nenhum provedor foi contratado, recurso criado ou mensagem real enviada nesta implementação.

Referências: [e-mail no Spring Boot](https://docs.spring.io/spring-boot/reference/io/email.html) e [limitações do Render Free](https://render.com/docs/free).

## Roteiro de aceite

1. Entrar com uma conta antiga: o painel e seus dados devem permanecer disponíveis.
2. Abrir `/admin` com a conta configurada: ver filtros e listagem. Tentar com outro anfitrião e músico: o painel deve negar acesso.
3. Sair e criar anfitrião em `/cadastro/anfitriao`: conferir o e-mail na caixa local; a criação não deve fazer login automático.
4. Entrar com essa conta antes de confirmar: deve abrir `/conta`. APIs de sessões devem retornar 403.
5. Abrir o link, confirmar explicitamente e verificar que fica aguardando aprovação. Reutilizar o link deve falhar.
6. No admin, abrir o cadastro e aprovar; atualizar a situação no celular: deve entrar no painel.
7. Suspender informando motivo: mesmo com o login antigo, as APIs devem negar acesso. O histórico deve registrar a alteração. Reaprovar e conferir o retorno do acesso.
8. Repetir o cadastro como músico em `/cadastro/musico`; após confirmação e aprovação, o anfitrião ainda precisa liberar a sessão selecionando o nome do músico.
9. Conferir que o menu de aprovação fica desabilitado para e-mail não confirmado. Duas telas com versões diferentes devem mostrar conflito em vez de sobrescrever uma decisão.
10. Testar reenvio, expiração e indisponibilidade do SMTP. No reenvio, somente o link mais recente deve funcionar.

## Verificação automatizada

- `backend/`: `./mvnw -B verify` com Docker disponível valida migrations e regras em PostgreSQL temporário; o envio SMTP é substituído por um mock.
- `frontend/`: `npm run build`; `npm run test:e2e` com frontend previamente iniciado pelo responsável testa as telas com API simulada, em desktop e celular.
