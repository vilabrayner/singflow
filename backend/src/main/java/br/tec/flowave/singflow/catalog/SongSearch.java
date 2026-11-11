package br.tec.flowave.singflow.catalog;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

@Service
public class SongSearch {
  public record Song(String title, String artist) {}

  private record Cached(long expires, List<Song> songs) {}

  private final RestClient client;
  private final String key;
  private final Map<String, Cached> cache = new LinkedHashMap<>();
  private long window;
  private int calls;

  @Autowired
  public SongSearch(@Value("${LASTFM_API_KEY:}") String key) {
    this(client(), key);
  }

  SongSearch(RestClient client, String key) {
    this.client = client;
    this.key = key;
  }

  private static RestClient client() {
    var factory =
        new JdkClientHttpRequestFactory(
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build());
    factory.setReadTimeout(Duration.ofSeconds(5));
    return RestClient.builder()
        .baseUrl("https://ws.audioscrobbler.com/2.0/")
        .requestFactory(factory)
        .build();
  }

  public synchronized List<Song> search(String query) {
    String text = query == null ? "" : query.strip();
    if (text.length() < 3) return List.of();
    if (text.length() > 160) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
    if (key.isBlank()) throw unavailable();
    long now = System.currentTimeMillis();
    String cacheKey = text.toLowerCase(Locale.ROOT);
    var hit = cache.get(cacheKey);
    if (hit != null && hit.expires > now) return hit.songs;
    if (now / 60000 != window) {
      window = now / 60000;
      calls = 0;
    }
    if (++calls > 120) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS);
    try {
      Map<?, ?> body =
          client
              .get()
              .uri(
                  uri ->
                      uri.queryParam("method", "track.search")
                          .queryParam("track", "{track}")
                          .queryParam("api_key", "{key}")
                          .queryParam("format", "json")
                          .queryParam("limit", 10)
                          .build(text, key))
              .retrieve()
              .body(Map.class);
      if (body == null
          || body.containsKey("error")
          || !(body.get("results") instanceof Map<?, ?> results)
          || !(results.get("trackmatches") instanceof Map<?, ?> matches)) throw unavailable();
      Object raw = matches.get("track");
      List<?> tracks =
          raw instanceof List<?> list ? list : raw instanceof Map<?, ?> ? List.of(raw) : List.of();
      var songs = new LinkedHashSet<Song>();
      for (Object item : tracks) {
        if (item instanceof Map<?, ?> track
            && track.get("name") instanceof String title
            && !title.isBlank()
            && title.length() <= 160) {
          String artist = track.get("artist") instanceof String a ? a.strip() : "";
          if (artist.length() <= 160) songs.add(new Song(title.strip(), artist));
          if (songs.size() == 10) break;
        }
      }
      var answer = List.copyOf(songs);
      cache.entrySet().removeIf(e -> e.getValue().expires <= now);
      if (cache.size() >= 200) cache.remove(cache.keySet().iterator().next());
      cache.put(cacheKey, new Cached(now + 300000, answer));
      return answer;
    } catch (Exception ignored) {
      // Do not expose provider URLs or exceptions: their query string includes the API key.
      throw unavailable();
    }
  }

  private static ResponseStatusException unavailable() {
    return new ResponseStatusException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "Busca indisponível. Você pode informar a música em texto livre.");
  }
}
