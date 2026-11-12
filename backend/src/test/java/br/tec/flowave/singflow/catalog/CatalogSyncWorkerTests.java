package br.tec.flowave.singflow.catalog;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class CatalogSyncWorkerTests {
  private final CatalogSync sync = mock(CatalogSync.class);
  private final SongSearch search = mock(SongSearch.class);
  private final CatalogSyncWorker worker = new CatalogSyncWorker(sync, search);

  private CatalogSync.Claim claim() {
    return new CatalogSync.Claim(
        new CatalogSync.Item(
            UUID.randomUUID(),
            UUID.randomUUID(),
            UUID.randomUUID(),
            "Song",
            "Artist",
            0,
            "PROCESSING",
            1,
            1,
            "",
            Instant.now()),
        UUID.randomUUID());
  }

  @Test
  void exactMatchNeedsOnlyOneProviderCall() {
    var claim = claim();
    when(sync.claim()).thenReturn(Optional.of(claim));
    var songs = List.of(new SongSearch.Song("Song", "Artist"));
    when(search.searchForCatalog("Song", "Artist")).thenReturn(songs);
    worker.tick();
    verify(sync).complete(claim, songs);
    verify(search, never()).searchForCatalog("Song", "");
  }

  @Test
  void nonExactArtistSearchFallsBackToTitle() {
    var claim = claim();
    when(sync.claim()).thenReturn(Optional.of(claim));
    when(search.searchForCatalog("Song", "Artist")).thenReturn(List.of());
    var songs = List.of(new SongSearch.Song("Song", "Other"));
    when(search.searchForCatalog("Song", "")).thenReturn(songs);
    worker.tick();
    verify(sync).complete(claim, songs);
  }

  @Test
  void rateLimitsAreRetriedAndNoClaimMakesNoProviderCall() {
    var claim = claim();
    when(sync.claim()).thenReturn(Optional.of(claim));
    when(search.searchForCatalog(any(), any()))
        .thenThrow(new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS));
    worker.tick();
    verify(sync).failed(claim, true);
    verify(sync, never()).complete(any(), any());
    reset(search);
    when(sync.claim()).thenReturn(Optional.empty());
    worker.tick();
    verifyNoInteractions(search);
  }
}
