import { Component, input } from '@angular/core';
import { StatusBadge } from './status-badge';
@Component({
  selector: 'app-history-item',
  imports: [StatusBadge],
  host: { style: 'display:block;min-width:0;' },
  styleUrls: ['../styles/song-panels.css', '../styles/history-items.css'],
  template: `<article class="choice-panel">
    <div class="history-row">
      <div class="choice-copy">
        <strong>{{ title() }}</strong>
        @if (subtitle()) {
          <p>{{ subtitle() }}</p>
        }
      </div>
      <app-status-badge [tone]="completed() ? 'positive' : 'neutral'">{{
        status()
      }}</app-status-badge>
    </div>
  </article>`,
})
export class HistoryItem {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
  readonly status = input.required<string>();
  readonly completed = input(false);
}
