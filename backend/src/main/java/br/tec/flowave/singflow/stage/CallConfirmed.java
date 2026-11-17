package br.tec.flowave.singflow.stage;

import java.util.UUID;

/** Emitted only when a call is created or a legacy call receives its first song. */
public record CallConfirmed(UUID sessionId,UUID callId,String title,String artist) {}
