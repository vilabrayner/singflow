# SingFlow frontend

Angular 22 SPA, PrimeNG 22 Community, Tailwind, PrimeIcons e Manrope.

Consulte o [README principal](../README.md) para pré-requisitos, licença, execução e testes, e a [fundação técnica](../docs/foundation.md) para detalhes.

- `npm ci`: instala as versões do lockfile.
- `npm start`: cria configuração somente se ausente, preserva seus valores e inicia em http://127.0.0.1:4200.
- `npm run build`: compila para `dist/singflow-web/browser`.
- `npm run format:check`: verifica formatação.
- `npm run test:config`: testa carregamento, validação e preservação da configuração, sem iniciar serviços.
- `npx playwright install chromium` e `npm test`: executam testes desktop e mobile.

Preencha `public/config.json` com sua chave em `primeUiLicense`. O modelo versionado é `public/config.example.json`; os valores locais são ignorados pelo Git. Não incluir chaves no modelo. Veja [Configuração por ambiente](../docs/runtime-configuration.md). Rotas e layouts são a fundação visual; os fluxos de negócio serão adicionados nos incrementos aprovados.
