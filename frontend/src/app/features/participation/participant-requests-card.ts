import { Component, computed, input, output } from '@angular/core';
import {
  CdkDrag,
  CdkDragHandle,
  CdkDropList,
  CdkDragDrop,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { SurfaceCard } from '../../shared/components/surface-card';
import { StatusBadge } from '../../shared/components/status-badge';
import { SongRequest } from '../sessions/session-api';
import { participantStatus } from './participant-view';
@Component({
  selector: 'app-participant-requests-card',
  imports: [SurfaceCard, StatusBadge, CdkDrag, CdkDragHandle, CdkDropList],
  templateUrl: './participant-requests-card.html',
  styleUrls: ['../../shared/styles/song-panels.css', './participant-requests-card.css'],
  host: { class: 'participant-card' },
})
export class ParticipantRequestsCard {
  readonly songs = input<SongRequest[]>([]);
  readonly editable = input(false);
  readonly busy = input(false);
  readonly pending = computed(() => this.songs().filter((s) => s.status === 'PENDING'));
  readonly fixed = computed(() => this.songs().filter((s) => s.status !== 'PENDING'));
  readonly added = output<void>();
  readonly edited = output<SongRequest>();
  readonly cancelled = output<SongRequest>();
  readonly reordered = output<{ expectedOrder: string[]; order: string[] }>();
  readonly status = participantStatus;
  private dragOrder: string[] = [];
  nudge(index: number, direction: number) {
    if (!this.editable() || this.busy()) return;
    const target = index + direction;
    if (target < 0 || target >= this.pending().length) return;
    const expectedOrder = this.pending().map((s) => s.id),
      order = [...expectedOrder];
    moveItemInArray(order, index, target);
    this.reordered.emit({ expectedOrder, order });
  }
  captureOrder() {
    this.dragOrder = this.pending().map((s) => s.id);
  }
  drop(event: CdkDragDrop<SongRequest[]>) {
    if (this.busy() || !this.editable() || event.previousIndex === event.currentIndex) return;
    const expectedOrder = this.dragOrder;
    // Polling can change the list during a gesture. Never apply an obsolete visual index.
    if (JSON.stringify(expectedOrder) !== JSON.stringify(this.pending().map((s) => s.id))) return;
    const order = [...expectedOrder];
    moveItemInArray(order, event.previousIndex, event.currentIndex);
    this.reordered.emit({ expectedOrder, order });
  }
}
