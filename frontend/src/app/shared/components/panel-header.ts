import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-panel-header',
  imports: [RouterLink],
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
