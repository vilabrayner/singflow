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

  public record Page(List<Match> items, String nextSource, int nextPage, boolean hasMore) {}

  public Page searchPage(String query, String source, int page) {
    if (page < 0 || page > 999 || !Set.of("catalog", "internet").contains(source))
      throw new org.springframework.web.server.ResponseStatusException(
          org.springframework.http.HttpStatus.BAD_REQUEST);
    String text = query == null ? "" : query.strip();
    if (text.length() > 160)
      throw new org.springframework.web.server.ResponseStatusException(
          org.springframework.http.HttpStatus.BAD_REQUEST);
    if (text.length() < 3) return new Page(List.of(), source, page, false);
    if (source.equals("catalog")) {
      var local = catalog.approved(text, page, 11);
      var items =
          local.stream()
              .limit(10)
              .map(song -> new Match(song.id(), song.title(), song.artist(), "SINGFLOW", null))
              .toList();
      boolean moreLocal = local.size() > 10;
      if (items.isEmpty() && lastfm.configured()) return searchPage(text, "internet", 0);
      return new Page(
          items,
          moreLocal ? "catalog" : "internet",
          moreLocal ? page + 1 : 0,
          moreLocal || lastfm.configured());
    }
    var remote = lastfm.searchPage(text, page + 1);
    return new Page(
        remote.songs().stream()
            .map(
                song -> new Match(null, song.title(), song.artist(), "LASTFM", choices.issue(song)))
            .toList(),
        "internet",
        page + 1,
        remote.hasMore() && page < 999);
  }
}
