package br.tec.flowave.singflow.requests.infrastructure;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@org.hibernate.annotations.DynamicUpdate
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

  @Column(nullable = false) public String creationFingerprint;
  public int semitones;
  public long settingsVersion;

  @Column(nullable = false, length = 12)
  public String status;

  @Column(nullable = false)
  public Instant createdAt;

  protected SongRequest() {}

  public SongRequest(UUID id, UUID session, UUID participant, UUID catalogSongId, String fingerprint) {
    this.id = id;
    this.sessionId = session;
    this.participantId = participant;
    this.catalogSongId = catalogSongId;
    this.creationFingerprint = fingerprint;
    this.status = "PENDING";
    this.createdAt = Instant.now();
  }
}
