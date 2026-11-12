import { inject, Injectable } from '@angular/core';
import { MessageService } from 'primeng/api';

@Injectable({ providedIn: 'root' })
export class Notifications {
  private readonly messages = inject(MessageService);

  success(detail: string) {
    this.messages.add({ severity: 'success', summary: detail });
  }
  info(detail: string) {
    this.messages.add({ severity: 'info', summary: detail });
  }
  warn(detail: string) {
    this.messages.add({ severity: 'warn', summary: detail });
  }
}
