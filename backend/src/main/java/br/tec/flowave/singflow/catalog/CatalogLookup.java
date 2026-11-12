package br.tec.flowave.singflow.catalog;

import java.util.*;
import org.springframework.stereotype.Service;

@Service
public class CatalogLookup {
  public record Match(UUID id, String title, String artist, String source, String selectionToken) {}

  private final CatalogService catalog;
  private final SongSearch lastfm;
  private final LastfmChoices choices;

  public CatalogLookup(CatalogService catalog, SongSearch lastfm, LastfmChoices choices) {
    this.catalog = catalog;
    this.lastfm = lastfm;
    this.choices = choices;
  }

  private String key(String title, String artist) {
    return title.strip().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT)
        + "|"
        + artist.strip().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
  }

  public List<Match> search(String query) {
    var local = catalog.approved(query);
    var result = new LinkedHashMap<String, Match>();
    for (var song : local)
      result.put(
          key(song.title(), song.artist()),
          new Match(song.id(), song.title(), song.artist(), "SINGFLOW", null));
    if (result.size() < 10) {
      try {
        for (var song : lastfm.search(query)) {
          result.putIfAbsent(
              key(song.title(), song.artist()),
              new Match(null, song.title(), song.artist(), "LASTFM", choices.issue(song)));
          if (result.size() >= 10) break;
        }
      } catch (org.springframework.web.server.ResponseStatusException error) {
        if (result.isEmpty()) throw error;
      }
    }
    return List.copyOf(result.values());
  }
}
