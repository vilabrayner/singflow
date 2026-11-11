package br.tec.flowave.singflow.musicians;

import br.tec.flowave.singflow.audit.AuditTrail;
import br.tec.flowave.singflow.identity.AccountAccess;
import br.tec.flowave.singflow.sessions.SessionAccess;
import br.tec.flowave.singflow.stage.StageService;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class MusicianAccess {
  public record Member(UUID id, String name, boolean enabled) {}

  public record PerformanceView(SessionAccess.SessionView session, StageService.StageView stage) {}

  private final JdbcClient jdbc;
  private final AccountAccess accounts;
  private final SessionAccess sessions;
  private final StageService stage;
  private final AuditTrail audit;

  public MusicianAccess(
      JdbcClient jdbc,
      AccountAccess accounts,
      SessionAccess sessions,
      StageService stage,
      AuditTrail audit) {
    this.jdbc = jdbc;
    this.accounts = accounts;
    this.sessions = sessions;
    this.stage = stage;
    this.audit = audit;
  }

  @Transactional
  public List<Member> members(UUID session, String actor) {
    sessions.lockOwned(session, actor, false);
    return jdbc.sql(
            "SELECT a.account_id,CASE WHEN trim(a.display_name)='' THEN 'Músico ' ||"
                + " left(a.account_id::text,8) ELSE a.display_name END AS name,a.email_verified AND"
                + " a.status='APPROVED' AS enabled FROM singflow.musician_session_grants g JOIN"
                + " singflow.host_accounts a ON a.email=g.email WHERE g.session_id=? AND g.active"
                + " ORDER BY lower(a.display_name),a.account_id")
        .param(session)
        .query(
            (rs, n) -> new Member(rs.getObject(1, UUID.class), rs.getString(2), rs.getBoolean(3)))
        .list();
  }

  @Transactional
  public List<AccountAccess.Musician> available(UUID session, String actor) {
    sessions.lockOwned(session, actor, true);
    return accounts.approvedMusicians();
  }

  @Transactional
  public List<Member> grantById(UUID session, String actor, UUID operation, UUID musician) {
    sessions.lockOwned(session, actor, true);
    return grant(session, actor, operation, accounts.musicianEmail(musician, true));
  }

  @Transactional
  public List<Member> revokeById(UUID session, String actor, UUID musician) {
    sessions.lockOwned(session, actor, true);
    return revoke(session, actor, accounts.musicianEmail(musician, false));
  }

  @Transactional
  public List<Member> grant(UUID session, String actor, UUID operation, String inputEmail) {
    sessions.lockOwned(session, actor, true);
    String email = inputEmail.trim().toLowerCase(Locale.ROOT);
    var previous =
        jdbc.sql(
                "SELECT session_id,email FROM singflow.musician_session_grants WHERE"
                    + " operation_id=?")
            .param(operation)
            .query((rs, n) -> Map.entry(rs.getObject(1, UUID.class), rs.getString(2)))
            .optional();
    if (previous.isPresent()) {
      if (!previous.get().getKey().equals(session) || !previous.get().getValue().equals(email))
        throw new ResponseStatusException(HttpStatus.CONFLICT, "Identificador já utilizado.");
      return members(session, actor);
    }
    accounts.requireMusician(email);
    boolean exists = assigned(session, email);
    jdbc.sql(
            "INSERT INTO singflow.musician_session_grants(operation_id,session_id,email,active)"
                + " VALUES (?,?,?,?)")
        .params(operation, session, email, !exists)
        .update();
    if (!exists) audit.record(actor, session, "MUSICIAN_ACCESS_GRANTED", operation);
    return members(session, actor);
  }

  @Transactional
  public List<Member> revoke(UUID session, String actor, String inputEmail) {
    sessions.lockOwned(session, actor, true);
    String email = inputEmail.trim().toLowerCase(Locale.ROOT);
    var operations =
        jdbc.sql(
                "SELECT operation_id FROM singflow.musician_session_grants WHERE session_id=? AND"
                    + " email=? AND active")
            .params(session, email)
            .query(UUID.class)
            .list();
    jdbc.sql(
            "UPDATE singflow.musician_session_grants SET active=false WHERE session_id=? AND"
                + " email=? AND active")
        .params(session, email)
        .update();
    operations.forEach(
        operation -> audit.record(actor, session, "MUSICIAN_ACCESS_REVOKED", operation));
    return members(session, actor);
  }

  private boolean assigned(UUID session, String actor) {
    return jdbc.sql(
            "SELECT EXISTS(SELECT 1 FROM singflow.musician_session_grants WHERE session_id=? AND"
                + " email=? AND active)")
        .params(session, actor)
        .query(Boolean.class)
        .single();
  }

  @Transactional(readOnly = true)
  public List<SessionAccess.SessionView> list(String actor, boolean host) {
    if (host)
      return sessions.list(actor).stream().filter(s -> !s.status().equals("DRAFT")).toList();
    return jdbc
        .sql(
            "SELECT session_id FROM singflow.musician_session_grants WHERE email=? AND active ORDER"
                + " BY created_at DESC")
        .param(actor)
        .query(UUID.class)
        .list()
        .stream()
        .map(id -> sessions.audienceContext(id).session())
        .filter(s -> !s.status().equals("DRAFT"))
        .toList();
  }

  @Transactional
  public PerformanceView performance(UUID session, String actor, boolean host) {
    var context = sessions.lockAudienceContext(session, false);
    if (!(host && context.owner().equals(actor)) && !assigned(session, actor))
      throw new ResponseStatusException(
          HttpStatus.NOT_FOUND, "Sessão indisponível para este músico.");
    return new PerformanceView(context.session(), stage.snapshot(session, context.owner()));
  }
}
