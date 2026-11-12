package br.tec.flowave.singflow.requests.infrastructure;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "song_requests", schema = "singflow")
public class SongRequest {
  @Id public UUID id;

  @Column(nullable = false)
  public UUID sessionId;

  @Column(nullable = false)
  public UUID participantId;

  public UUID catalogSongId;

  @Column(insertable = false, updatable = false)
  public long requestOrder;

  @Column(nullable = false, length = 160)
  public String title;

  @Column(length = 160)
  public String artist;

  @Column(nullable = false, length = 12)
  public String status;

  @Column(nullable = false)
  public Instant createdAt;

  protected SongRequest() {}

  public SongRequest(UUID id, UUID session, UUID participant, String title, String artist) {
    this.id = id;
    this.sessionId = session;
    this.participantId = participant;
    this.title = title;
    this.artist = artist;
    this.status = "PENDING";
    this.createdAt = Instant.now();
  }
}
