import { Component, computed, inject, output } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HostAuth } from '../../features/identity/host-auth';
import { accountHasRole } from '../../features/identity/account-view';

@Component({
  selector: 'app-panel-switcher',
  imports: [RouterLink],
  template: `@if (panels().length) {
    <p class="sf-muted">Alternar painel</p>
    @for (panel of panels(); track panel.path) {
      <a
        class="sf-button sf-text sf-full"
        role="menuitem"
        [routerLink]="panel.path"
        (click)="chosen.emit()"
      >
        <i [class]="panel.icon" aria-hidden="true"></i>{{ panel.label }}
      </a>
    }
  }`,
})
export class PanelSwitcher {
  private readonly auth = inject(HostAuth);
  private readonly router = inject(Router);
  readonly chosen = output<void>();
  readonly panels = computed(() => {
    const account = this.auth.current();
    if (!account) return [];
    return [
      {
        path: '/anfitriao',
        label: 'Anfitrião',
        icon: 'fa-solid fa-bullhorn',
        allowed: accountHasRole(account, 'HOST') || account.administrator,
      },
      {
        path: '/musico',
        label: 'Músico',
        icon: 'fa-solid fa-guitar',
        allowed:
          accountHasRole(account, 'MUSICIAN') ||
          accountHasRole(account, 'HOST') ||
          account.administrator,
      },
      {
        path: '/admin',
        label: 'Administração',
        icon: 'fa-solid fa-shield-halved',
        allowed: account.administrator,
      },
      {
        path: '/minha-conta',
        label: 'Participante',
        icon: 'fa-solid fa-user',
        allowed: accountHasRole(account, 'PARTICIPANT'),
      },
    ].filter((panel) => panel.allowed && this.router.url.split(/[?#]/)[0] !== panel.path);
  });
}
