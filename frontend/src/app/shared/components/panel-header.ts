import { Component } from '@angular/core';
import { BrandLogo } from './brand-logo';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-panel-header',
  imports: [RouterLink, BrandLogo],
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
          <app-brand-logo />
        </a>
        <div class="sf-header-actions"><ng-content /></div>
      </div>
    </header>
  `,
})
export class PanelHeader {}
