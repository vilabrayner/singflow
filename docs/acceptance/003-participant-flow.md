# Roteiro — participante pelo celular

Estado: implementação em validação; aceite manual pendente. AWS e acesso em aparelho físico continuam adiados.

## Revisão de saída e retorno

Os passos de saída e revogação deste roteiro descrevem a versão atual. As [novas regras de retorno voluntário](../participant-return-review.md) foram aprovadas e implementadas. Para saída, retorno e esquecimento, usar o [roteiro atualizado](004-participant-return.md), que substitui os passos 8–9 e as referências à revogação em toda saída abaixo.

## Preparação

O responsável inicia/reinicia os serviços pela IDE. As migrations V4, V5 e V6 são aplicadas pelo Flyway ao iniciar o backend, sem apagar os ensaios. A V4 foi restaurada ao conteúdo original (checksum `2083844152`); a V5 acrescenta o histórico de rotações do link e o índice das janelas de limite. Para bancos que já receberam a V4 original, basta reiniciar o backend pela IDE; não executar `repair`.

- Independentes: iniciar `SingflowApplicationLocal` e o frontend como de costume. A origem do link é `http://127.0.0.1:4200` por padrão.
- Docker: reconstruir as imagens e iniciar o Compose pela IDE com `docker compose up -d --build`. A origem padrão dos links acompanha `WEB_PORT` (8081). Não usar `down -v`.
- Se usar outro endereço, configurar `SINGFLOW_PUBLIC_APP_URL` no ambiente do backend (ou `.env` carregado pelo inicializador local). Aceita uma origem HTTPS ou HTTP em loopback, sem caminho, credenciais, query ou fragmento. O endereço não é inferido do cabeçalho Host.
- Em produção, usar perfil `prod` para cookies Secure e servir a API pela mesma origem da interface, sob `/api`. O caminho do cookie do participante é específico da sessão.
- `localhost` no QR aponta para o próprio aparelho: neste ensaio, abrir o link no navegador do computador. Não alterar bind, firewall ou publicar serviços nesta etapa.

## Ensaio

1. Entrar como anfitrião, criar e abrir uma sessão. Clicar em **Mostrar link e QR Code**. Conferir o link e abrir **Entrada do participante** em outra aba, no mesmo navegador.
2. Informar nome e primeira música. Conferir origem **Inscrição pelo celular** no painel do anfitrião e a mesma prioridade de chegada do cadastro assistido.
3. Recarregar a aba do participante e abrir o mesmo link em outra aba. Deve recuperar o cadastro e o primeiro pedido, sem alterar chegada ou apresentações. Duas abas com primeira entrada são serializadas pelo navegador quando Web Locks estiver disponível; o servidor reutiliza o vínculo da sessão do navegador.
4. Abrir o link em janela privada e cadastrar o mesmo nome: são pessoas distintas, sem acesso mútuo. Não vincular participante assistido pelo nome.
5. Pedir outra música e cancelar um pedido pendente. Chegada e contagens não mudam. Simular desconexão: uma operação sem resposta não deve mostrar sucesso; tentar novamente na mesma tela reutiliza o identificador do pedido.
6. Aprovar uma convocação pelo anfitrião. O participante recebe a chamada após Atualizar ou até 10 segundos com a página visível. Pedido reservado não oferece cancelamento; resolver com o anfitrião.
7. Testar pausa, primeira falta, segunda falta e retorno pelo anfitrião. Conferir as mensagens do participante e que ele não controla essas transições. A indicação de sugestão não é convocação e não promete posição fixa.
8. Durante convocação, confirmar **Sair da sessão** pelo participante. Conferir chamada resolvida como desistência, pedidos não atendidos cancelados e histórico preservado. A outra aba perde o acesso na próxima atualização. Login do anfitrião permanece válido.
9. Reativar pelo anfitrião. A credencial revogada não volta a funcionar. O anfitrião passa a coletar músicas; recuperação/transferência segura de acesso fica fora deste recorte.
10. Com outro participante ativo, trocar o link pelo anfitrião. Link antigo não permite novas inscrições; participante já inscrito continua lendo e enviando pedidos pela credencial válida.
11. Encerrar sessão sem convocação pendente. Participante continua lendo o próprio histórico, mas não entra nem envia/cancela pedidos. Pode encerrar o acesso.
12. Reiniciar somente o backend pela IDE: vínculo do participante, pedidos, contagens e palco permanecem no banco. Repetir o roteiro via Docker com seu volume próprio.

## Proteção e limites

- Acesso por cookie HttpOnly, SameSite=Lax, separado de JSESSIONID e dos papéis de anfitrião. Tokens aleatórios de 256 bits; banco armazena SHA-256. Validade fixa de 24 horas, sem renovação silenciosa. Saída ou registro de saída pelo anfitrião revoga o acesso.
- CSRF também nas mutações públicas. Não guardar tokens de acesso em URL, armazenamento JavaScript ou QR Code. O QR é gerado no próprio navegador, usando `qrcode`, sem serviço externo.
- Mostrar somente participação, pedidos, convocação, histórico e indicação de sugestão próprios. Não expor fila nominal, outros participantes ou e-mail do anfitrião.
- Limites em janelas de um minuto persistidas no PostgreSQL. `SINGFLOW_ENTRY_LIMIT_PER_MINUTE=120` por sessão/endereço remoto para preparar acesso; teto agregado por sessão é três vezes esse valor. Leitura do link público também usa três vezes esse valor por sessão/endereço.
- `SINGFLOW_REQUEST_LIMIT_PER_MINUTE=20` por credencial para mutações; `SINGFLOW_READ_LIMIT_PER_MINUTE=120` para consultas próprias. O servidor responde 429 com orientação de esperar e `Retry-After: 60`. Contagens rejeitadas permanecem registradas; janelas com mais de um dia são limpas nas consultas seguintes. Não armazenar IP em claro.
- IP é o endereço remoto observado pelo backend, sem confiar em X-Forwarded-For fornecido pelo cliente. Atrás do Nginx, o limite de entrada pode abranger todos os visitantes; estes valores consideram Wi-Fi compartilhado e precisam ser calibrados antes de publicação.
- Mesmo navegador significa cookies preservados. Limpar cookies, trocar de perfil/aparelho ou perder o vínculo impede reconhecimento confiável. Nome não é identidade: procurar o anfitrião para preservar contagens.

## Evidências desta implementação

- Backend: 29 testes passaram em `verify`, conforme resultado `BUILD SUCCESS` informado pelo responsável após correções. Inclui PostgreSQL temporário, V4, privacidade, concorrência de check-in, idempotência, saída durante chamada, revogação, expiração, sessão fechada e resposta 429 com Retry-After.
- Frontend: 18 testes de navegador passaram em desktop/mobile com API simulada; 5 testes de configuração passaram. Build de produção aprovado.
- Avisos de build: pacote inicial de aproximadamente 530 kB (limite de aviso 500 kB, já ultrapassado anteriormente) e dependências CommonJS do gerador QR. O QR é carregado sob demanda; os limites do projeto foram preservados.
- Ensaio integrado e aceite manual: pendentes.

## Validação automatizada

`cd backend && ./mvnw -B verify` valida com PostgreSQL temporário via Testcontainers, sem usar o banco de ensaio. Executar pelo responsável na IDE.

`cd frontend && npm run test:config && npm run build` valida configuração e compilação. `npm run test:e2e` usa o frontend já iniciado pelo responsável e API simulada; cobre fluxos desktop/mobile sem alterar os dados locais. Isso não substitui o ensaio integrado acima.

Após a separação de V4/V5, repetir `./mvnw -B verify` pela IDE para validar a nova sequência com PostgreSQL temporário.
