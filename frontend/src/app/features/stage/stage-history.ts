import { Component, input, output } from '@angular/core';
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
        [subtitleClickable]="catalogEditable() && !!call.catalogSongId"
        (subtitleChosen)="songEdited.emit(call.catalogSongId!)"
        [detail]="
          call.performedKey
            ? 'Tom cantado: ' + call.performedKey
            : call.keyLabel
              ? 'Tom: ' + call.keyLabel
              : null
        "
        [status]="labels(call.status)"
        [completed]="call.status === 'COMPLETED'"
        [statusBelow]="statusBelow()"
      >
        @if (editable() && call.status === 'COMPLETED') {
          <button
            history-actions
            type="button"
            class="sf-icon-button"
            title="Registrar tom cantado"
            [attr.aria-label]="'Registrar tom cantado por ' + call.participantName"
            (click)="keyEdited.emit(call)"
          >
            <i class="fa-solid fa-sliders" aria-hidden="true"></i>
          </button>
        }
      </app-history-item>
    } @empty {
      <p>Nenhuma apresentação registrada nesta sessão.</p>
    }
  </div>`,
})
export class StageHistory {
  readonly catalogEditable = input(false);
  readonly songEdited = output<string>();
  readonly calls = input.required<StageCall[]>();
  readonly labels = callStatus;
  readonly editable = input(false);
  readonly statusBelow = input(false);
  readonly keyEdited = output<StageCall>();
}
