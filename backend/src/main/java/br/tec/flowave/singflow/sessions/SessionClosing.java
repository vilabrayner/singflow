package br.tec.flowave.singflow.sessions;

import java.util.UUID;

public record SessionClosing(UUID sessionId, String actor) {}
