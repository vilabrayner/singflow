package br.tec.flowave.singflow.audit;
import java.util.UUID;
/** Invalidation only; no participant data crosses this module boundary. */
public record SessionChanged(UUID session) {}
