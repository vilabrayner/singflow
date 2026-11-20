package br.tec.flowave.singflow.realtime;
import br.tec.flowave.singflow.catalog.CatalogSongChanged;
import br.tec.flowave.singflow.audit.SessionChanged;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;
import java.util.UUID;

@Component
class CatalogRealtime {
  private final JdbcClient jdbc;
  private final RealtimeHub hub;
  CatalogRealtime(JdbcClient jdbc,RealtimeHub hub){this.jdbc=jdbc;this.hub=hub;}
  @TransactionalEventListener
  public void changed(CatalogSongChanged event) {
    jdbc.sql("SELECT DISTINCT s.id FROM singflow.sessions s WHERE s.status='OPEN' AND (EXISTS(SELECT 1 FROM singflow.song_requests r WHERE r.session_id=s.id AND r.catalog_song_id=:song) OR EXISTS(SELECT 1 FROM singflow.stage_calls c WHERE c.session_id=s.id AND c.catalog_song_id=:song))")
      .param("song",event.songId()).query(UUID.class).list().forEach(id->hub.changed(new SessionChanged(id)));
  }
}
