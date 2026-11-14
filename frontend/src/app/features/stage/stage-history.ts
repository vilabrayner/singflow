import { Component, input } from '@angular/core';
import { HistoryItem } from '../../shared/components/history-item';
import { StageCall, callStatus } from './stage-api';
@Component({
  selector: 'app-stage-history',
  imports: [HistoryItem],
  styles: `
    :host {
      display: block;
    }
    .history-list {
      display: grid;
      gap: 12px;
      margin: 16px 0 0;
    }
  `,
  template: `<div class="history-list">
    @for (call of calls(); track call.id; let index = $index) {
      <app-history-item
        [title]="call.participantName"
        [subtitle]="
          (call.title || 'Música não definida') + (call.artist ? ' — ' + call.artist : '')
        "
        [order]="calls().length - index"
        [status]="labels(call.status)"
        [completed]="call.status === 'COMPLETED'"
      />
    } @empty {
      <p>Nenhuma apresentação registrada nesta sessão.</p>
    }
  </div>`,
})
export class StageHistory {
  readonly calls = input.required<StageCall[]>();
  readonly labels = callStatus;
}
