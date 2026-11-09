# Configuração por ambiente

## Contrato versionado, valores por ambiente

`frontend/public/config.example.json` documenta o formato. `RuntimeConfig` e seu parser definem os tipos e validações em `frontend/src/app/core/config/runtime-config.ts`. Valores de desenvolvimento ficam em `frontend/public/config.json`, ignorado pelo Git.

```json
{
  "apiBaseUrl": "/api",
  "primeUiLicense": ""
}
```

`primeUiLicense` é a chave emitida pela PrimeUI. O cliente verifica o tipo, não a validade comercial da chave; a validação continua com o fornecedor. Campo vazio produz aviso claro no console e pode exibir o aviso de licença do PrimeUI. `apiBaseUrl` reserva o caminho base para os próximos serviços de negócio; deve ser um caminho no mesmo domínio, sem query ou fragmento. O health atual usa `/actuator/health` e não esse prefixo.

## Desenvolvimento

O primeiro `npm start` ou `npm run build` cria `public/config.json` a partir do modelo, somente se ele não existir. Antes de usar a aplicação, preencha a chave nesse arquivo. Os comandos seguintes validam e preservam o conteúdo, inclusive quando uma variável de ambiente tiver outro valor.

Alternativamente, copie `public/config.example.json` para `public/config.json` e edite antes do primeiro início. Se o arquivo já existir, não faça uma nova cópia sobre seus valores.

Na criação inicial apenas, `PRIMEUI_LICENSE_KEY` pode fornecer a chave. Na ausência dessa variável, um `public/config.js` legado no formato esperado é lido como JSON para migrar a chave. O JavaScript legado não é mais incluído pela página e não é executado pelo script de migração. O arquivo antigo não é apagado automaticamente.

Após editar `config.json`, recarregue a página. Se o servidor local não refletir a mudança do arquivo estático, reinicie-o pelo terminal da IDE. Os serviços são gerenciados pelo responsável.

## Inicialização

O navegador carrega `config.json` relativo ao base URL da aplicação, com `cache: no-store` e timeout de 10 segundos. Somente depois de validar o documento inicia o Angular e configura o PrimeNG. Arquivo ausente, JSON inválido ou campos com tipos incorretos impedem a inicialização e mostram mensagem acessível. A aplicação não mostra nem registra a chave nos erros.

## Produção

1. Compile o frontend uma vez com `npm ci` e `npm run build`.
2. Use `dist/singflow-web/browser` como artefato estático.
3. Antes de liberar o ambiente, substitua o `config.json` do artefato por um documento válido com os valores daquele ambiente, por cópia ou volume montado somente para leitura.
4. Sirva `config.json` com `Content-Type: application/json` e `Cache-Control: no-store`. Não aplique o fallback da SPA a esse arquivo. Configure essas regras também no CDN, se houver.
5. Sirva as rotas da SPA com fallback para `index.html`, e encaminhe API e futuro WebSocket ao backend no mesmo domínio.

O build local copia sua configuração para a saída: não publique esse arquivo inadvertidamente em outro ambiente. A implantação deve sempre substituí-lo pelo arquivo correspondente. Trocar parâmetros não exige reconstruir JavaScript; basta atualizar o arquivo e recarregar a aplicação.

Configuração de hospedagem e automação de implantação serão implementadas quando o provedor for escolhido. O fluxo CI existente pode usar `PRIMEUI_LICENSE_KEY` dos secrets na criação inicial do arquivo. Não distribuir esse artefato para desenvolvimento de terceiros com sua chave incluída.

Todo parâmetro desse arquivo chega ao navegador. Não armazenar senhas, tokens privados ou credenciais do banco. A chave PrimeUI pode aparecer no bundle público da aplicação conforme os termos do fornecedor, mas não deve ser publicada para reutilização por terceiros.

## Verificação sem serviços

`npm run test:config` testa criação, preservação de valores, migração do formato anterior, rejeição de configuração inválida e carregamento sem cache. `npm run build` verifica a integração com Angular. A emissão da chave e sua validade devem ser confirmadas pelo responsável junto à PrimeUI.
