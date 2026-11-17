package br.tec.flowave.singflow.catalog;

import java.util.*;

/** Persistence adapter, separate from external search. Caller owns authorization and transaction locks. */
public interface StreamingReferenceStore {
  record State(UUID songId, String url, long version) {}
  String type();
  State get(UUID song);
  void update(UUID song, String url);
  List<State> session(UUID session);
}
