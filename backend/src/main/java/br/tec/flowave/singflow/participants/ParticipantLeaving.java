package br.tec.flowave.singflow.participants;

import java.util.UUID;

public record ParticipantLeaving(
    UUID sessionId,
    UUID participantId,
    String actor,
    String auditActor,
    boolean voluntary,
    boolean selfReturnAllowed) {
  public ParticipantLeaving(UUID sessionId, UUID participantId, String actor) {
    this(sessionId, participantId, actor, actor, false, false);
  }

  public ParticipantLeaving(UUID sessionId, UUID participantId, String actor, String auditActor) {
    this(sessionId, participantId, actor, auditActor, false, false);
  }
}
