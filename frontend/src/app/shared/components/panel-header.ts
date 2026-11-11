import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-panel-header',
  imports: [RouterLink],
  styles: `
    :host {
      display: block;
      height: var(--sf-header-height, 73px);
    }
    .sf-panel-header {
      position: fixed;
      inset: 0 0 auto;
      z-index: 20;
    }
  `,
  template: `
    <header class="sf-panel-header">
      <div class="sf-header-inner">
        <a class="sf-brand" routerLink="/" aria-label="SingFlow, início">
          <i class="pi pi-microphone" aria-hidden="true"></i><span>SingFlow</span>
        </a>
        <div class="sf-header-actions"><ng-content /></div>
      </div>
    </header>
  `,
})
export class PanelHeader {}
