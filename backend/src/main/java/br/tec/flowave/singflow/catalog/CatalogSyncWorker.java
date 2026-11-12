package br.tec.flowave.singflow.catalog;

import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.*;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(
    name = "SINGFLOW_CATALOG_SYNC_ENABLED",
    havingValue = "true",
    matchIfMissing = true)
class CatalogSyncWorker {
  private final CatalogSync sync;
  private final SongSearch search;
  private static final org.slf4j.Logger log =
      org.slf4j.LoggerFactory.getLogger(CatalogSyncWorker.class);

  CatalogSyncWorker(CatalogSync sync, SongSearch search) {
    this.sync = sync;
    this.search = search;
  }

  @Scheduled(fixedDelay = 2000, initialDelay = 3000)
  public void tick() {
    try {
      var next = sync.claim();
      if (next.isEmpty()) return;
      var claim = next.get();
      try {
        var item = claim.item();
        var matches = new ArrayList<>(search.searchForCatalog(item.title(), item.artist()));
        if (!item.artist().isBlank()
            && matches.stream().noneMatch(c -> SyncMatching.exact(item.title(), item.artist(), c)))
          matches.addAll(search.searchForCatalog(item.title(), ""));
        sync.complete(claim, matches);
      } catch (org.springframework.web.server.ResponseStatusException error) {
        sync.failed(claim, error.getStatusCode().value() == 429);
      } catch (RuntimeException ignored) {
        sync.failed(claim, false);
      }
    } catch (RuntimeException ignored) {
      log.warn(
          "Sincronização do catálogo não concluiu esta rodada; retomada pelo estado persistido.");
    }
  }
}
