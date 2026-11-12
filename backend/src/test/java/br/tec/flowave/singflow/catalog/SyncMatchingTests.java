package br.tec.flowave.singflow.catalog;

import static org.assertj.core.api.Assertions.*;

import java.util.*;
import org.junit.jupiter.api.Test;

class SyncMatchingTests {
  @Test
  void normalizationIsConservativeAndNeverApprovesTitleAlone() {
    assertThat(
            SyncMatching.exact(
                "  CAFE\u0301  Azul ", "ARTISTA", new SongSearch.Song("Café Azul", "Artista")))
        .isTrue();
    assertThat(SyncMatching.exact("Song", "", new SongSearch.Song("Song", "Artist"))).isFalse();
    assertThat(SyncMatching.exact("Song", "Artist", new SongSearch.Song("Song (Live)", "Artist")))
        .isFalse();
    assertThat(SyncMatching.exact("Cafe", "Artist", new SongSearch.Song("Café", "Artist")))
        .isFalse();
  }

  @Test
  void closestCandidatesComeFirstAndNeverExceedTen() {
    var list = new ArrayList<SongSearch.Song>();
    for (int i = 0; i < 20; i++) list.add(new SongSearch.Song("Another " + i, "Someone"));
    list.add(new SongSearch.Song("Song", "Artist"));
    assertThat(SyncMatching.rank("Song", "Artist", list))
        .hasSize(10)
        .first()
        .isEqualTo(new SongSearch.Song("Song", "Artist"));
  }

  @Test
  void distinctVersionsOfIdenticalMetadataStayAmbiguous() {
    var first =
        new SongSearch.Song(
            "Song",
            "Artist",
            "https://www.last.fm/music/A/_/B",
            "11111111-1111-4111-8111-111111111111");
    var other =
        new SongSearch.Song(
            "Song",
            "Artist",
            "https://www.last.fm/music/A/_/B",
            "22222222-2222-4222-8222-222222222222");
    assertThat(SyncMatching.rank("Song", "Artist", List.of(first, other))).hasSize(2);
  }
}
