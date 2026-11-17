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
      Long resolutionOrder,
      Instant acceptedAt, UUID catalogSongId, int semitones, String originalKey, String performedKey, long keyVersion, String choiceFingerprint) {}

  public record Wait(UUID participantId, boolean manualRelease) {}

  public record Blocker(UUID waitingId, UUID blockerId) {}

  private final JdbcClient jdbc;

  public StageStore(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  private Call map(ResultSet rs, int row) throws SQLException {
    var resolved = rs.getTimestamp("resolved_at");
    var accepted = rs.getTimestamp("accepted_at");
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
        rs.getObject("resolution_order", Long.class),
        accepted == null ? null : accepted.toInstant(),rs.getObject("catalog_song_id",UUID.class),rs.getInt("semitones"),rs.getString("original_key"),rs.getString("performed_key"),rs.getLong("key_version"),rs.getString("choice_fingerprint"));
  }

  public List<Call> calls(UUID session) {
    return jdbc.sql(
            "SELECT c.*,s.title,nullif(s.artist,'') AS artist,s.original_key FROM singflow.stage_calls c LEFT JOIN singflow.catalog_songs s ON s.id=c.catalog_song_id WHERE c.session_id=:session ORDER BY c.created_at DESC,c.id DESC")
        .param("session", session)
        .query(this::map)
        .list();
  }

  public void insert(
      UUID id,
      UUID session,
      UUID participant,
      UUID request,
      String title,
      String artist,
      UUID catalogSong, int semitones) {
    jdbc.sql(
            "INSERT INTO"
                + " singflow.stage_calls(id,session_id,participant_id,request_id,status,created_at,catalog_song_id,semitones,choice_fingerprint)"
                + " VALUES"
                + " (:id,:session,:participant,:request,'CALLED',:created,:catalog,:semitones,:fingerprint)")
        .param("id", id)
        .param("session", session)
        .param("participant", participant)
        .param("request", request)
        .param("semitones", semitones)
        .param("fingerprint", title==null?null:br.tec.flowave.singflow.catalog.MusicKey.fingerprint(title,artist))
        .param("catalog", catalogSong)
        .param("created", Timestamp.from(Instant.now()))
        .update();
  }

  public void accept(UUID session, UUID call) {
    int updated =
        jdbc.sql(
                "UPDATE singflow.stage_calls SET accepted_at=now()"
                    + " WHERE session_id=? AND id=? AND status='CALLED' AND accepted_at IS NULL")
            .params(session, call)
            .update();
    if (updated != 1) throw new IllegalStateException("Call was not pending under session lock");
  }

  public void setSong(UUID session, UUID call, String title, String artist, UUID catalogSong) {
    int updated =
        jdbc.sql(
                "UPDATE singflow.stage_calls SET"
                    + " catalog_song_id=:catalog,choice_fingerprint=:fingerprint WHERE"
                    + " session_id=:session AND id=:call AND status='CALLED' AND catalog_song_id IS NULL")
            .param("catalog", catalogSong)
            .param("fingerprint", br.tec.flowave.singflow.catalog.MusicKey.fingerprint(title,artist))
            .param("session", session)
            .param("call", call)
            .update();
    if (updated != 1) throw new IllegalStateException("Call song was not set under session lock");
  }

  public void resolve(UUID session, UUID call, String status, String title, String artist) {
    int updated =
        jdbc.sql(
                "UPDATE singflow.stage_calls SET"
                    + " status=:status,resolved_at=:resolved,resolution_order=nextval('singflow.stage_resolution_order_seq')"
                    + " WHERE session_id=:session AND id=:call AND status='CALLED'")
            .param("status", status)
            .param("resolved", Timestamp.from(Instant.now()))
            .param("session", session)
            .param("call", call)
            .update();
    if (updated != 1) throw new IllegalStateException("Call was not active under session lock");
  }

  public void performedKey(UUID session,UUID call,String key) {
    jdbc.sql("UPDATE singflow.stage_calls SET performed_key=?,key_version=key_version+1 WHERE session_id=? AND id=?").params(key,session,call).update();
  }

  public record QueueSkip(UUID sessionId, UUID participantId, UUID requestId) {}

  public Optional<QueueSkip> skipOperation(UUID operation) {
    return jdbc.sql(
            "SELECT session_id,participant_id,expected_request_id FROM singflow.stage_queue_skips"
                + " WHERE operation_id=?")
        .param(operation)
        .query(
            (rs, n) ->
                new QueueSkip(
                    rs.getObject(1, UUID.class),
                    rs.getObject(2, UUID.class),
                    rs.getObject(3, UUID.class)))
        .optional();
  }

  public Optional<UUID> nextAfterSkip(UUID session) {
    return jdbc.sql(
            "SELECT next_participant_id FROM singflow.stage_queue_skips WHERE session_id=? AND"
                + " active")
        .param(session)
        .query(UUID.class)
        .optional();
  }

  public void consumeSkip(UUID session) {
    jdbc.sql("UPDATE singflow.stage_queue_skips SET active=false WHERE session_id=? AND active")
        .param(session)
        .update();
  }

  public void skip(UUID session, UUID operation, UUID participant, UUID request, UUID next) {
    consumeSkip(session);
    jdbc.sql(
            """
            INSERT INTO singflow.stage_queue_skips
            (operation_id,session_id,participant_id,expected_request_id,next_participant_id)
            VALUES (?,?,?,?,?)
            """)
        .params(operation, session, participant, request, next)
        .update();
  }

  public List<UUID> manualOrder(UUID session) {
    return jdbc.sql(
            "SELECT participant_id FROM singflow.stage_manual_order WHERE session_id=? ORDER BY"
                + " position")
        .param(session)
        .query(UUID.class)
        .list();
  }

  public void consumeManual(UUID session, UUID participant) {
    jdbc.sql("DELETE FROM singflow.stage_manual_order WHERE session_id=? AND participant_id=?")
        .params(session, participant)
        .update();
  }

  public boolean replayOrder(
      UUID session, UUID operation, List<UUID> expected, List<UUID> ordered) {
    var saved =
        jdbc.sql(
                "SELECT session_id,expected_ids,ordered_ids FROM singflow.stage_queue_reorders"
                    + " WHERE operation_id=?")
            .param(operation)
            .query(
                (rs, n) ->
                    List.of(
                        rs.getObject(1, UUID.class),
                        Arrays.asList((UUID[]) rs.getArray(2).getArray()),
                        Arrays.asList((UUID[]) rs.getArray(3).getArray())))
            .optional();
    if (saved.isEmpty()) return false;
    if (!saved.get().equals(List.of(session, expected, ordered)))
      throw new org.springframework.web.server.ResponseStatusException(
          org.springframework.http.HttpStatus.CONFLICT, "Identificador já utilizado.");
    return true;
  }

  public void saveOrder(UUID session, UUID operation, List<UUID> expected, List<UUID> ordered) {
    jdbc.sql("DELETE FROM singflow.stage_manual_order WHERE session_id=?").param(session).update();
    for (int i = 0; i < ordered.size(); i++)
      jdbc.sql("INSERT INTO singflow.stage_manual_order VALUES(?,?,?)")
          .params(session, ordered.get(i), i)
          .update();
    jdbc.sql(
            "INSERT INTO"
                + " singflow.stage_queue_reorders(operation_id,session_id,expected_ids,ordered_ids)"
                + " VALUES(?,?,cast(? AS uuid[]),cast(? AS uuid[]))")
        .params(
            operation,
            session,
            expected.toString().replace('[', '{').replace(']', '}'),
            ordered.toString().replace('[', '{').replace(']', '}'))
        .update();
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
