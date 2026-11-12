package br.tec.flowave.singflow.catalog;

import java.util.UUID;
import org.springframework.stereotype.Service;

/** Query the provider outside transactions and recheck versions before replacing candidates. */
@Service
public class CatalogRefinement {
  private final CatalogSync sync;
  private final SongSearch search;

  public CatalogRefinement(CatalogSync sync, SongSearch search) {
    this.sync = sync;
    this.search = search;
  }

  public CatalogSync.Detail search(
      String actor, UUID id, long revision, String title, String artist) {
    var query = sync.refinement(actor, id, revision, title, artist);
    var matches = search.searchForCatalog(query.title(), query.artist());
    return sync.refined(actor, query, matches);
  }
}
