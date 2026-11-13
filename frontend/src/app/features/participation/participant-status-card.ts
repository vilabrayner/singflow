import { Component, computed, input, output } from '@angular/core';
import { SurfaceCard } from '../../shared/components/surface-card';
import { OwnView } from './participant-view';
@Component({
  selector: 'app-participant-status-card',
  imports: [SurfaceCard],
  templateUrl: './participant-status-card.html',
  host: { class: 'participant-card' },
})
export class ParticipantStatusCard {
  readonly data = input.required<OwnView>();
  readonly busy = input(false);
  readonly disconnected = input(false);
  readonly updatedAt = input<Date | null>(null);
  readonly accepted = output<string>();
  readonly skipped = output<string>();
  readonly resumed = output<void>();
  readonly nextSong = computed(() =>
    this.data().requests.find((song) => song.status === 'PENDING'),
  );
}
