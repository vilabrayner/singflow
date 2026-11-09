import { bootstrapApplication } from '@angular/platform-browser';
import { createAppConfig } from './app/app.config';
import { App } from './app/app';
import { loadRuntimeConfig } from './app/core/config/runtime-config';

async function start(): Promise<void> {
  const config = await loadRuntimeConfig(document.baseURI);
  if (!config.primeUiLicense) {
    console.warn(
      'SingFlow: primeUiLicense não foi preenchida em config.json. O PrimeUI poderá exibir aviso de licença.',
    );
  }
  await bootstrapApplication(App, createAppConfig(config));
}

start().catch(() => {
  // Never log configuration values or server responses, which may include a license key.
  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.textContent =
    'Não foi possível iniciar o SingFlow. Verifique se config.json está disponível e contém apiBaseUrl e primeUiLicense válidos. Depois, recarregue a página.';
  document.querySelector('app-root')?.replaceChildren(message);
  console.error('SingFlow: falha ao carregar a configuração ou iniciar a aplicação.');
});
