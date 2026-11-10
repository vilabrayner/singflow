package br.tec.flowave.singflow.participants.infrastructure;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "participants", schema = "singflow")
public class Participant {
  @Id public UUID id;

  @Column(nullable = false)
  public UUID sessionId;

  @Column(nullable = false, length = 120)
  public String name;

  @Column(length = 40)
  public String tableLabel;

  @Column(nullable = false, length = 12)
  public String status;

  @Column(nullable = false, length = 12)
  public String origin;

  @Column(nullable = false)
  public Instant checkedInAt;

  @Column(nullable = false, insertable = false, updatable = false)
  public long checkInOrder;

  @Column(nullable = false)
  public int completedPerformances;

  @Column(nullable = false, insertable = false)
  public long queueOrder;

  @Column(nullable = false)
  public Instant queueJoinedAt;

  @Column(nullable = false)
  public int consecutiveAbsences;

  @Column(nullable = false)
  public boolean selfPaused;

  @Version public long version;

  protected Participant() {}

  public Participant(UUID id, UUID sessionId, String name, String tableLabel) {
    this.id = id;
    this.sessionId = sessionId;
    this.name = name;
    this.tableLabel = tableLabel;
    this.status = "ACTIVE";
    this.origin = "ASSISTED";
    this.checkedInAt = Instant.now();
    this.queueJoinedAt = this.checkedInAt;
  }
}
