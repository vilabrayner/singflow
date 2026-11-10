package br.tec.flowave.singflow.participants;

import java.util.UUID;

public record ParticipantLeaving(UUID sessionId, UUID participantId, String actor) {}
