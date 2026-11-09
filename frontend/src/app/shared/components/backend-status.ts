import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { timeout } from 'rxjs';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-backend-status',
  imports: [ButtonModule],
  template: `<div class="backend-status">
    <span role="status">{{ message() }}</span
    ><p-button
      label="Verificar conexão"
      icon="pi pi-refresh"
      size="small"
      [outlined]="true"
      [loading]="checking()"
      (onClick)="check()"
    />
  </div>`,
})
export class BackendStatus {
  private readonly http = inject(HttpClient);
  readonly checking = signal(false);
  readonly message = signal('Conexão com o servidor ainda não verificada.');
  check() {
    if (this.checking()) return;
    this.checking.set(true);
    this.http
      .get<{ status: string }>('/actuator/health')
      .pipe(timeout(5000))
      .subscribe({
        next: (data) => {
          this.message.set(data.status === 'UP' ? 'Servidor conectado.' : 'Servidor indisponível.');
          this.checking.set(false);
        },
        error: () => {
          this.message.set('Servidor indisponível. Tente novamente.');
          this.checking.set(false);
        },
      });
  }
}
