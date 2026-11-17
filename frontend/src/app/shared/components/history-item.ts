import { Component, input } from '@angular/core';
import { StatusBadge } from './status-badge';
@Component({
  selector: 'app-history-item',
  imports: [StatusBadge],
  host: { style: 'display:block;min-width:0;' },
  styleUrls: ['../styles/song-panels.css', '../styles/history-items.css'],
  template: `<article
    class="choice-panel"
    [class.history-numbered]="order() !== null || !!railIcon()"
  >
    @if (order() !== null) {
      <div class="history-order" [attr.aria-label]="'Participação ' + order()">{{ order() }}</div>
    } @else if (railIcon()) {
      <div class="history-order" aria-hidden="true"><i [class]="railIcon()"></i></div>
    }
    <div class="history-row">
      <div class="choice-copy">
        <strong>{{ title() }}</strong>
        @if (subtitle()) {
          <p>{{ subtitle() }}</p>
        }
        @if (detail()) {
          <p>{{ detail() }}</p>
        }
        <ng-content />
        @if (statusBelow()) {
          <app-status-badge [tone]="completed() ? 'positive' : 'neutral'">{{
            status()
          }}</app-status-badge>
        }
      </div>
      @if (!statusBelow()) {
        <app-status-badge [tone]="completed() ? 'positive' : 'neutral'">{{
          status()
        }}</app-status-badge>
      }
      <div class="history-actions"><ng-content select="[history-actions]" /></div>
    </div>
  </article>`,
})
export class HistoryItem {
  readonly order = input<number | null>(null);
  readonly railIcon = input<string | null>(null);
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
  readonly status = input.required<string>();
  readonly completed = input(false);
  readonly statusBelow = input(false);
  readonly detail = input<string | null>(null);
}
