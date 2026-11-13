package br.tec.flowave.singflow.catalog;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class CatalogLookupTests {
  private final CatalogService catalog = mock(CatalogService.class);
  private final SongSearch provider = mock(SongSearch.class);
  private final CatalogLookup lookup =
      new CatalogLookup(catalog, provider, mock(LastfmChoices.class));

  private CatalogService.Song song(String title, String artist) {
    return new CatalogService.Song(
        UUID.randomUUID(),
        title,
        artist,
        "APPROVED",
        "ADMIN",
        null,
        0,
        Instant.now(),
        Instant.now());
  }

  @Test
  void localResultsComeFirstAndExternalDuplicatesDoNotUseTwoSlots() {
    var local = song("Equalize", "Pitty");
    when(catalog.approved("Equ")).thenReturn(List.of(local));
    when(provider.search("Equ"))
        .thenReturn(
            List.of(
                new SongSearch.Song(" equalize ", "PITTY"),
                new SongSearch.Song("Outra", "Artista")));
    var result = lookup.search("Equ");
    assertThat(result).hasSize(2);
    assertThat(result.getFirst().id()).isEqualTo(local.id());
    assertThat(result.getFirst().source()).isEqualTo("SINGFLOW");
    assertThat(result.getLast().source()).isEqualTo("LASTFM");
  }

  @Test
  void tenLocalResultsAvoidExternalCalls() {
    when(catalog.approved("Música"))
        .thenReturn(
            java.util.stream.IntStream.range(0, 10)
                .mapToObj(i -> song("Música " + i, "Artista"))
                .toList());
    assertThat(lookup.search("Música")).hasSize(10);
    verifyNoInteractions(provider);
  }

  @Test
  void providerFailureDoesNotHideLocalCatalog() {
    when(catalog.approved("Equ")).thenReturn(List.of(song("Equalize", "Pitty")));
    when(provider.search("Equ"))
        .thenThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE));
    assertThat(lookup.search("Equ")).hasSize(1);
  }

  @Test
  void differentArtistsRemainDifferentAndResponsesAreCapped() {
    when(catalog.approved("Song")).thenReturn(List.of(song("Song", "One")));
    when(provider.search("Song"))
        .thenReturn(
            java.util.stream.IntStream.range(0, 15)
                .mapToObj(i -> new SongSearch.Song("Song", "Artist " + i))
                .toList());
    assertThat(lookup.search("Song")).hasSize(10);
  }

  @Test
  void incrementalSearchFinishesLocalPagesBeforeOfferingInternet() {
    var local =
        java.util.stream.IntStream.range(0, 11).mapToObj(i -> song("Song " + i, "Artist")).toList();
    when(catalog.approved("Song", 0, 11)).thenReturn(local);
    var first = lookup.searchPage("Song", "catalog", 0);
    assertThat(first.items()).hasSize(10);
    assertThat(first.nextSource()).isEqualTo("catalog");
    assertThat(first.nextPage()).isEqualTo(1);
    assertThat(first.hasMore()).isTrue();
    verifyNoInteractions(provider);
    when(provider.configured()).thenReturn(true);
    when(catalog.approved("Song", 1, 11)).thenReturn(List.of(local.getLast()));
    var second = lookup.searchPage("Song", "catalog", 1);
    assertThat(second.items()).hasSize(1);
    assertThat(second.nextSource()).isEqualTo("internet");
    assertThat(second.nextPage()).isZero();
    when(provider.searchPage("Song", 1))
        .thenReturn(
            new SongSearch.SearchPage(List.of(new SongSearch.Song("External", "Artist")), false));
    assertThat(
            lookup
                .searchPage("Song", second.nextSource(), second.nextPage())
                .items()
                .getFirst()
                .source())
        .isEqualTo("LASTFM");
  }

  @Test
  void incrementalFailureCanRetryTheSamePageAndInvalidPagesAreRejected() {
    when(provider.searchPage("Song", 2))
        .thenThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE))
        .thenReturn(new SongSearch.SearchPage(List.of(), false));
    assertThatThrownBy(() -> lookup.searchPage("Song", "internet", 1))
        .isInstanceOf(ResponseStatusException.class);
    assertThat(lookup.searchPage("Song", "internet", 1).hasMore()).isFalse();
    assertThatThrownBy(() -> lookup.searchPage("Song", "internet", -1))
        .isInstanceOf(ResponseStatusException.class);
    assertThatThrownBy(() -> lookup.searchPage("Song", "other", 0))
        .isInstanceOf(ResponseStatusException.class);
  }
}
