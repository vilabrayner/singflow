package br.tec.flowave.singflow.stage.infrastructure;

import java.sql.*;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class StageStore {
  public record Call(
      UUID id,
      UUID sessionId,
      UUID participantId,
      UUID requestId,
      String title,
      String artist,
      String status,
      Instant createdAt,
      Instant resolvedAt,
      Long resolutionOrder) {}

  public record Wait(UUID participantId, boolean manualRelease) {}

  public record Blocker(UUID waitingId, UUID blockerId) {}

  private final JdbcClient jdbc;

  public StageStore(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  private Call map(ResultSet rs, int row) throws SQLException {
    var resolved = rs.getTimestamp("resolved_at");
    return new Call(
        rs.getObject("id", UUID.class),
        rs.getObject("session_id", UUID.class),
        rs.getObject("participant_id", UUID.class),
        rs.getObject("request_id", UUID.class),
        rs.getString("title"),
        rs.getString("artist"),
        rs.getString("status"),
        rs.getTimestamp("created_at").toInstant(),
        resolved == null ? null : resolved.toInstant(),
        rs.getObject("resolution_order", Long.class));
  }

  public List<Call> calls(UUID session) {
    return jdbc.sql(
            "SELECT * FROM singflow.stage_calls WHERE session_id=:session ORDER BY created_at"
                + " DESC,id DESC")
        .param("session", session)
        .query(this::map)
        .list();
  }

  public void insert(
      UUID id, UUID session, UUID participant, UUID request, String title, String artist) {
    jdbc.sql(
            "INSERT INTO"
                + " singflow.stage_calls(id,session_id,participant_id,request_id,title,artist,status,created_at)"
                + " VALUES (:id,:session,:participant,:request,:title,:artist,'CALLED',:created)")
        .param("id", id)
        .param("session", session)
        .param("participant", participant)
        .param("request", request)
        .param("title", title)
        .param("artist", artist)
        .param("created", Timestamp.from(Instant.now()))
        .update();
  }

  public void resolve(UUID session, UUID call, String status, String title, String artist) {
    int updated =
        jdbc.sql(
                "UPDATE singflow.stage_calls SET"
                    + " status=:status,title=:title,artist=:artist,resolved_at=:resolved,resolution_order=nextval('singflow.stage_resolution_order_seq')"
                    + " WHERE session_id=:session AND id=:call AND status='CALLED'")
            .param("status", status)
            .param("title", title)
            .param("artist", artist)
            .param("resolved", Timestamp.from(Instant.now()))
            .param("session", session)
            .param("call", call)
            .update();
    if (updated != 1) throw new IllegalStateException("Call was not active under session lock");
  }

  public void waitFor(UUID session, UUID participant, List<UUID> blockers) {
    jdbc.sql(
            "INSERT INTO singflow.stage_waits(session_id,participant_id,manual_release) VALUES"
                + " (?,?,?)")
        .params(session, participant, blockers.isEmpty())
        .update();
    for (UUID blocker : blockers)
      jdbc.sql(
              "INSERT INTO singflow.stage_wait_blockers(session_id,waiting_id,blocker_id) VALUES"
                  + " (?,?,?)")
          .params(session, participant, blocker)
          .update();
  }

  public List<Wait> waits(UUID session) {
    return jdbc.sql(
            "SELECT participant_id,manual_release FROM singflow.stage_waits WHERE session_id=?")
        .param(session)
        .query((rs, row) -> new Wait(rs.getObject(1, UUID.class), rs.getBoolean(2)))
        .list();
  }

  public List<Blocker> blockers(UUID session) {
    return jdbc.sql(
            "SELECT waiting_id,blocker_id FROM singflow.stage_wait_blockers WHERE session_id=?")
        .param(session)
        .query((rs, row) -> new Blocker(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class)))
        .list();
  }

  public void removeBlocker(UUID session, UUID waiting, UUID blocker) {
    jdbc.sql(
            "DELETE FROM singflow.stage_wait_blockers WHERE session_id=? AND waiting_id=? AND"
                + " blocker_id=?")
        .params(session, waiting, blocker)
        .update();
  }

  public void removeWait(UUID session, UUID participant) {
    jdbc.sql("DELETE FROM singflow.stage_waits WHERE session_id=? AND participant_id=?")
        .params(session, participant)
        .update();
  }
}
