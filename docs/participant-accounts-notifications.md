# Conta opcional do participante e avisos

Implementação na branch `feature/websocket`, sem publicação automática. O acesso por QR Code continua funcionando sem cadastro. Cadastro com nome, e-mail e senha usa confirmação de e-mail, sem aprovação administrativa; músicos e anfitriões mantêm sua aprovação existente.

## Conta e participação

- `/cadastro/participante`: cadastro opcional; `/minha-conta`: login, vínculo, recuperação e preferências.
- Uma conta pode ter uma participação por sessão. Não há associação por semelhança de nomes, e-mail ou número informado sem confirmação.
- O participante pode vincular sua participação atual mediante cookie válido e identificação esperada. Recuperar em outro aparelho exige conta ativa e confirmação explícita; revoga o acesso anterior, preserva chegada, pedidos e apresentações e não reativa quem foi retirado pelo anfitrião.
- O cadastro não altera prioridade ou ordem da fila.
- Uma conta staff também pode usar o perfil pessoal; o papel PARTICIPANT não concede APIs de gestão.

## WhatsApp: configurar em etapas

Não enviar segredos pelo chat nem colocá-los no frontend. Variáveis listadas em `.env.example` pertencem ao backend; preencher valores no ambiente privado.

1. Para verificar o webhook, configurar `SINGFLOW_WHATSAPP_APP_SECRET` e um valor aleatório próprio em `SINGFLOW_WHATSAPP_VERIFY_TOKEN`, mantendo `SINGFLOW_WHATSAPP_ENABLED=false`. Publicar o endpoint antes de verificar.
2. No painel Meta, URL de callback: `https://singflow.flowave.tec.br/api/public/whatsapp/webhook`. No campo **Verificar token**, usar exatamente o valor de `SINGFLOW_WHATSAPP_VERIFY_TOKEN`. O GET retorna o desafio; o POST valida HMAC-SHA256 do corpo bruto. A página `/callback` é apenas informativa.
3. Configurar ID do número e assinar o campo `messages` no WABA correspondente. As restrições de teste e publicação exibidas pela Meta continuam aplicáveis.
4. Para enviar, preencher versão Graph suportada pelo app (`vNN.N`), ID do número, número comercial com país/DDD somente dígitos, access token, segredo, verify token, nome do template aprovado e idioma. Só então habilitar `SINGFLOW_WHATSAPP_ENABLED=true`.
5. O template configurado recebe três parâmetros no corpo, nesta ordem: nome do participante, nome da sessão, música. Deve ter um botão URL dinâmico no índice 0, com URL base `https://singflow.flowave.tec.br/minha-conta?retomar={{1}}`; o parâmetro enviado é o UUID da sessão, sem credenciais no link. A Meta decide aprovação, categoria e custos do template.

O usuário marca consentimento e abre uma conversa com uma mensagem preparada `SINGFLOW <código>`. O vínculo só é feito após receber a mensagem assinada pela Meta, confirmando o controle do número. Código de uso único, dez minutos, armazenado como hash. O envio de `SAIR` ou `PARAR` desativa o canal; as preferências do perfil também permitem desativar. Não se usa o telefone livre do check-in para presumir consentimento ou propriedade.

O primeiro incremento exige o número remetente no webhook para confirmar o telefone. Eventos sem `from`, por exemplo usuários identificados apenas por BSUID, são ignorados; não há associação por suposição. Não há implementação de rastreamento de entregue/lido: `SENT` significa apenas aceito pela API.

## Web Push

- `SINGFLOW_WEB_PUSH_ENABLED=true` exige par VAPID público/privado válido e `SINGFLOW_WEB_PUSH_SUBJECT=mailto:contato@flowave.tec.br`. A chave privada nunca é retornada pela API.
- Para gerar um par local, executar na pasta frontend `node scripts/generate-push-keys.mjs /caminho/privado/singflow-web-push.env`. O diretório deve existir. O comando grava arquivo novo com permissão 0600 e imprime somente o caminho; não sobrescreve chaves. Preservar o par entre deploys. Não versionar o arquivo gerado.
- Permissão é solicitada apenas pelo botão de ativação. Exige HTTPS, exceto localhost quando aceito pelo navegador. No iPhone/iPad, adicionar à Tela de Início e abrir por lá; o acesso HTTP por IP na rede local não habilita Web Push.
- Service worker próprio, sem cache de páginas, assets ou APIs. A entrega revalida o cookie, sessão aberta e chamada ainda pendente antes de exibir a notificação. Expirada, concluída, aceita ou revogada não vira uma convocação antiga.
- Cada aparelho tem sua inscrição; remover um aparelho não remove os demais. Alterar o par VAPID exige reativação pelo usuário. Os endpoints permitidos são de provedores de push conhecidos, sem redirecionamentos ou destinos arbitrários.

## Processamento e limites

Os eventos de convocação gravam intenções na mesma transação do palco. Rollback não envia mensagens. Um worker independente retira trabalhos com bloqueio, sem prender a transação do banco durante a chamada HTTP. Pode ser desativado com `SINGFLOW_NOTIFICATIONS_WORKER_ENABLED=false`.

São avisos de convocação, com validade de dois minutos, para contas vinculadas e canais autorizados. O envio revalida acesso, sessão, apresentação, preferências e inscrição. Deduplicação por chamada/canal/destino. Não se promete entrega instantânea: navegador, sistema operacional, internet e provedor influenciam.

Estados: `PENDING`, `PROCESSING`, `SENT`, `SKIPPED`, `FAILED`, `UNKNOWN`. Apenas recusa explícita 429 pode repetir, com limite de três tentativas dentro da validade. Timeout, falha ambígua e lease vencido ficam UNKNOWN sem reenvio automático, reduzindo risco de mensagem duplicada. Não usar UNKNOWN como prova de não envio. Não há fila de marketing nem envio real nos testes.

As permissões e consentimentos são auditados. V22 acrescenta tabelas de perfil, vínculo, consentimento, códigos, inscrições e outbox. Migrations anteriores são preservadas. Políticas de retenção/exclusão devem incluir essas novas tabelas no atendimento a solicitações; não existe exclusão automática ao abrir a página pública de instruções.

## Validação

- Backend: `./mvnw -B verify` (PostgreSQL temporário, provedores simulados).
- Foco: `./mvnw -B '-Dtest=NotificationPolicyTests,ParticipantAccountsIntegrationTests' test`.
- Frontend: `npm run test:config`, `npm run build` e Playwright de contas/avisos com API simulada.
- Conferência real após publicar: verificar desafio Meta, confirmar número próprio com opt-in, convocar, testar opt-out, instalar no iPhone/Android e habilitar push por toque. Envio real depende de autorização e configuração dos provedores.

Referências: [webhooks Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview), [Web Push iOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
