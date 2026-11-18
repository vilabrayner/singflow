# Páginas públicas e configuração da Meta

Implementação local em 18/11/2026. Contato autorizado: `contato@flowave.tec.br`. O responsável não forneceu nome/razão social; os textos identificam a plataforma SingFlow e o canal de atendimento, sem inventar pessoa jurídica, CNPJ ou encarregado.

## Endereços após publicação

- Privacidade: `https://singflow.flowave.tec.br/politica-privacidade`.
- Termos: `https://singflow.flowave.tec.br/termos-de-uso`.
- Instruções de exclusão: `https://singflow.flowave.tec.br/excluir-dados-pessoais`.
- Segurança: `https://singflow.flowave.tec.br/politica-seguranca`.
- Direitos LGPD: `https://singflow.flowave.tec.br/lgpd`.
- Ajuda sobre conexão do WhatsApp: `https://singflow.flowave.tec.br/callback`.

As páginas são públicas, não exigem login e têm links na home. Os textos descrevem os recursos do app e não afirmam certificação de conformidade ou aprovação pela Meta. A exclusão é solicitada por atendimento; abrir uma página ou usar `mailto` não apaga uma conta nem garante que o e-mail tenha sido enviado. O operador deve efetivamente receber e atender as solicitações.

## Webhook do WhatsApp

O responsável confirmou que o campo solicitado é a URL de callback do **webhook do WhatsApp**. Usar:

`https://singflow.flowave.tec.br/api/public/whatsapp/webhook`

A verificação GET valida `hub.mode`, `hub.verify_token` e devolve `hub.challenge`. O POST valida `X-Hub-Signature-256` com o segredo do app. A rota `/callback` é uma página de ajuda, não o endpoint técnico. Não expor o segredo do app nem tokens privados no frontend. Para verificar o webhook, configurar `SINGFLOW_WHATSAPP_APP_SECRET` e `SINGFLOW_WHATSAPP_VERIFY_TOKEN` no backend publicado. O envio pode continuar desativado (`SINGFLOW_WHATSAPP_ENABLED=false`). No painel Meta, o campo **Verificar token** deve ter exatamente o valor de `SINGFLOW_WHATSAPP_VERIFY_TOKEN`, escolhido pelo operador. Não é o access token da API. O token nunca vai para o frontend.

O recebimento de mensagens também exige o `SINGFLOW_WHATSAPP_PHONE_NUMBER_ID` correspondente e a assinatura do campo `messages` no WhatsApp Business Account. A aplicação valida a assinatura do corpo antes de processá-lo. Enquanto o app não estiver publicado na Meta, observar as restrições de eventos de teste mostradas no painel.

Não clicar em verificar antes de publicar este endpoint. Um deploy anterior não passa a oferecer a nova rota apenas porque a variável foi configurada.

Não há Facebook Login neste incremento. Um callback de exclusão da Meta com `signed_request`, código de protocolo e página de status é outro fluxo; não deve ser confundido com o webhook. Para o campo de exclusão de dados, usar o modo **URL de instruções de exclusão** com a página acima, quando disponível nessa configuração.

## Referências consultadas

- https://developers.facebook.com/documentation/development/create-an-app/app-dashboard/basic-settings
- https://developers.facebook.com/documentation/development/create-an-app/app-dashboard/data-deletion-callback
- https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started
- https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares

Nenhum commit, push ou deploy realizado ao criar estas páginas.
