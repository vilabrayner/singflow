import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { routes } from './app.routes';
import { SingflowPreset } from './core/theme/singflow.preset';
import type { RuntimeConfig } from './core/config/runtime-config';
import { RUNTIME_CONFIG } from './core/config/runtime-config.token';

export function createAppConfig(runtimeConfig: RuntimeConfig): ApplicationConfig {
  return {
    providers: [
      MessageService,
      { provide: RUNTIME_CONFIG, useValue: runtimeConfig },
      provideBrowserGlobalErrorListeners(),
      provideRouter(routes, withComponentInputBinding()),
      provideHttpClient(),
      providePrimeNG({
        license: runtimeConfig.primeUiLicense,
        theme: {
          preset: SingflowPreset,
          options: {
            darkModeSelector: '.singflow-dark',
            cssLayer: { name: 'primeng', order: 'theme, base, primeng, components, utilities' },
          },
        },
      }),
    ],
  };
}
