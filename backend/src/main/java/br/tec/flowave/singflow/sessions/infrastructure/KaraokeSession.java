package br.tec.flowave.singflow.sessions.infrastructure;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "sessions", schema = "singflow")
public class KaraokeSession {
  @Id public UUID id;

  @Column(nullable = false, length = 254)
  public String owner;

  @Column(nullable = false, length = 120)
  public String name;

  @Column(nullable = false, length = 12)
  public String status;

  @Column(nullable = false)
  public Instant createdAt;

  @Version public long version;

  protected KaraokeSession() {}

  public KaraokeSession(UUID id, String owner, String name) {
    this.id = id;
    this.owner = owner;
    this.name = name;
    this.status = "DRAFT";
    this.createdAt = Instant.now();
  }
}
