import { Component, input } from '@angular/core';

@Component({
  selector: 'app-status-badge',
  template: `<span
    class="sf-badge"
    [class.sf-badge-positive]="tone() === 'positive'"
    [class.sf-badge-attention]="tone() === 'attention'"
    ><ng-content
  /></span>`,
})
export class StatusBadge {
  readonly tone = input<'neutral' | 'positive' | 'attention'>('neutral');
}
