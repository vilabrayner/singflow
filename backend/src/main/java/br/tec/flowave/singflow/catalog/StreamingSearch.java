package br.tec.flowave.singflow.catalog;

import java.util.List;

/** Provider contract; authentication, quotas and payload adaptation belong to each implementation. */
public interface StreamingSearch {
  record Provider(String type, String label, String icon) {}
  record Track(String type, String id, String title, String artist, String album, int durationMs, String url) {}
  record Page(Provider provider, List<Track> items, int page, boolean hasMore) {}
  Provider provider();
  Page search(String query, int page);
  /** Validate and canonicalize a track URL; null removes the reference. Never fetch arbitrary URLs. */
  String normalizeUrl(String input);
}
