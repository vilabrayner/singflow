package br.tec.flowave.singflow.catalog;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class CatalogRefinementTests {
  private final CatalogSync sync = mock(CatalogSync.class);
  private final SongSearch search = mock(SongSearch.class);
  private final CatalogRefinement refinement = new CatalogRefinement(sync, search);
  private final UUID id = UUID.randomUUID();

  private CatalogSync.Refinement query() {
    return new CatalogSync.Refinement(
        new CatalogSync.Item(
            id,
            UUID.randomUUID(),
            UUID.randomUUID(),
            "Gis",
            "",
            0,
            "REVIEW",
            2,
            1,
            "",
            Instant.now()),
        "Giz",
        "Legião Urbana");
  }

  @Test
  void queriesEditedTitleAndArtistWithoutApplyingAnApproval() {
    var query = query();
    when(sync.refinement("admin", id, 2, " Giz ", "Legião Urbana")).thenReturn(query);
    var songs = List.of(new SongSearch.Song("Giz", "Legião Urbana"));
    when(search.searchForCatalog(query.title(), query.artist())).thenReturn(songs);
    refinement.search("admin", id, 2, " Giz ", "Legião Urbana");
    verify(sync).refined("admin", query, songs);
    verify(sync, never()).approve(any(), any(), any(), any(), any());
    verify(sync, never()).complete(any(), any());
  }

  @Test
  void providerFailureDoesNotReplaceStoredCandidates() {
    var query = query();
    when(sync.refinement(any(), any(), anyLong(), any(), any())).thenReturn(query);
    when(search.searchForCatalog(any(), any()))
        .thenThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE));
    assertThatThrownBy(() -> refinement.search("admin", id, 2, "Giz", "Legião Urbana"))
        .isInstanceOf(ResponseStatusException.class);
    verify(sync, never()).refined(any(), any(), any());
  }

  @Test
  void failedPreconditionsDoNotSpendProviderCalls() {
    when(sync.refinement(any(), any(), anyLong(), any(), any()))
        .thenThrow(new ResponseStatusException(HttpStatus.CONFLICT));
    assertThatThrownBy(() -> refinement.search("admin", id, 1, "Giz", "Legião Urbana"))
        .isInstanceOf(ResponseStatusException.class);
    verifyNoInteractions(search);
  }
}
