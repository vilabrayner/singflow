package br.tec.flowave.singflow.catalog;

import br.tec.flowave.singflow.identity.AccountLifecycle;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** Opaque server-issued proof of a provider result; no browser-supplied source flag is trusted. */
@Service
public class LastfmChoices {
  private final JdbcClient jdbc;

  public LastfmChoices(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  @Transactional
  public String issue(SongSearch.Song song) {
    if (song.artist().isBlank()) return null;
    jdbc.sql("DELETE FROM singflow.lastfm_choices WHERE expires_at<clock_timestamp()").update();
    String url = SongSearch.safeUrl(song.url()), mbid = SongSearch.safeMbid(song.mbid());
    String hash =
        AccountLifecycle.hash(
            song.title().length()
                + ":"
                + song.title()
                + song.artist().length()
                + ":"
                + song.artist()
                + url.length()
                + ":"
                + url
                + mbid);
    return jdbc.sql(
            "INSERT INTO singflow.lastfm_choices VALUES(?,?,?,?,?,?,clock_timestamp()+interval '30"
                + " minutes') ON CONFLICT(fingerprint) DO UPDATE SET expires_at=excluded.expires_at"
                + " RETURNING id")
        .params(UUID.randomUUID(), hash, song.title(), song.artist(), url, mbid)
        .query(UUID.class)
        .single()
        .toString();
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public SongSearch.Song require(String token, String title, String artist) {
    UUID id;
    try {
      id = UUID.fromString(token);
    } catch (Exception ignored) {
      throw unavailable();
    }
    var choice =
        jdbc.sql(
                "SELECT * FROM singflow.lastfm_choices WHERE id=? AND expires_at>clock_timestamp()")
            .param(id)
            .query(
                (rs, n) ->
                    new SongSearch.Song(
                        rs.getString("title"),
                        rs.getString("artist"),
                        rs.getString("lastfm_url"),
                        rs.getString("lastfm_mbid")))
            .optional()
            .orElseThrow(LastfmChoices::unavailable);
    if (!SyncMatching.normalize(choice.title()).equals(SyncMatching.normalize(title))
        || !SyncMatching.normalize(choice.artist()).equals(SyncMatching.normalize(artist)))
      throw unavailable();
    return choice;
  }

  private static ResponseStatusException unavailable() {
    return new ResponseStatusException(
        HttpStatus.CONFLICT,
        "A seleção da música expirou ou foi alterada. Pesquise e selecione novamente.");
  }
}
