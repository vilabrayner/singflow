import { Component } from '@angular/core';
import { version } from '../../../../package.json';

/** Built from the app package, never from mutable runtime configuration. */
@Component({
  selector: 'app-version-footer',
  host: { style: 'display:block;flex:none;' },
  styles: `
    footer {
      padding: 12px 20px;
      border-top: 1px solid var(--sf-border);
      background: var(--sf-surface, #fff);
      color: var(--sf-muted);
      font-size: 12px;
      text-align: center;
      overflow-wrap: anywhere;
    }
  `,
  template: `<footer aria-label="Versão do SingFlow">Versão {{ version }}</footer>`,
})
export class VersionFooter {
  readonly version = version;
}
