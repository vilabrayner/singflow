package br.tec.flowave.singflow.catalog;
import java.util.UUID;
/** Raised inside the request transaction only when catalog registration creates a new song. */
public record SongEnrichmentRequested(UUID songId) {}
