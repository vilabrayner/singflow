import { Component, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { SurfaceCard } from '../../shared/components/surface-card';
import { HistoryItem } from '../../shared/components/history-item';
import { SongRequest } from '../sessions/session-api';
import { OwnView, participantStatus } from './participant-view';
@Component({
  selector: 'app-participant-history-card',
  imports: [NgTemplateOutlet, SurfaceCard, HistoryItem],
  templateUrl: './participant-history-card.html',
  styleUrls: ['../../shared/styles/song-panels.css', './participant-history-card.css'],
  host: { class: 'participant-card' },
})
export class ParticipantHistoryCard {
  readonly data = input.required<OwnView>();
  readonly cancelled = input<SongRequest[]>([]);
  readonly status = participantStatus;
}
