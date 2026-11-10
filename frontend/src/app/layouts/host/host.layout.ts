import { Component } from '@angular/core';
import { HostDashboard } from '../../features/sessions/host-dashboard';
@Component({
  imports: [HostDashboard],
  template: '<app-host-dashboard />',
  styles: ':host { display: block; background: var(--sf-canvas); }',
})
export class HostLayout {}
