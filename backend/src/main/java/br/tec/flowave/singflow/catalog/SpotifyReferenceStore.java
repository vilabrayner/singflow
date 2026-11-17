package br.tec.flowave.singflow.catalog;

import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Uses the existing catalog column. No provider-specific SQL reaches controllers or the facade. */
@Component
public class SpotifyReferenceStore implements StreamingReferenceStore {
  private final JdbcClient jdbc;
  public SpotifyReferenceStore(JdbcClient jdbc){this.jdbc=jdbc;}
  @Override public String type(){return "spotify";}
  @Override public State get(UUID song) {
    return jdbc.sql("SELECT id,spotify_url,version FROM singflow.catalog_songs WHERE id=? AND deleted_at IS NULL AND status<>'MERGED'")
        .param(song).query((rs,n)->new State(rs.getObject("id",UUID.class),rs.getString("spotify_url"),rs.getLong("version")))
        .optional().orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Música indisponível. Atualize a lista."));
  }
  @Override public void update(UUID song,String url) {
    jdbc.sql("UPDATE singflow.catalog_songs SET spotify_url=?,version=version+1,updated_at=clock_timestamp() WHERE id=?").params(url,song).update();
  }
  @Override public List<State> session(UUID session) {
    return jdbc.sql("SELECT id,spotify_url,version FROM singflow.catalog_songs WHERE deleted_at IS NULL AND spotify_url IS NOT NULL AND id IN (SELECT catalog_song_id FROM singflow.song_requests WHERE session_id=:session UNION SELECT catalog_song_id FROM singflow.stage_calls WHERE session_id=:session)")
        .param("session",session).query((rs,n)->new State(rs.getObject("id",UUID.class),rs.getString("spotify_url"),rs.getLong("version"))).list();
  }
}
