package br.tec.flowave.singflow.administration;

import br.tec.flowave.singflow.identity.AccountLifecycle;
import br.tec.flowave.singflow.musicians.MusicianAccess;
import br.tec.flowave.singflow.sessions.SessionAccess;
import br.tec.flowave.singflow.stage.StageService;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Administrative read model. No session operations are exposed by this module. */
@Service
public class SessionOverview {
  public record Host(String name, String email) {}

  public record Summary(SessionAccess.SessionView session, Host host) {}

  public record Detail(
      SessionAccess.SessionView session,
      Host host,
      List<MusicianAccess.Member> musicians,
      StageService.StageView stage) {}

  private final JdbcClient jdbc;
  private final AccountLifecycle accounts;
  private final SessionAccess sessions;
  private final MusicianAccess musicians;
  private final StageService stage;

  public SessionOverview(
      JdbcClient jdbc,
      AccountLifecycle accounts,
      SessionAccess sessions,
      MusicianAccess musicians,
      StageService stage) {
    this.jdbc = jdbc;
    this.accounts = accounts;
    this.sessions = sessions;
    this.musicians = musicians;
    this.stage = stage;
  }

  private void requireAdmin(String actor) {
    var a = accounts.get(actor);
    if (!a.active() || !a.administrator())
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acesso administrativo necessário.");
  }

  @Transactional(readOnly = true)
  public List<Summary> open(String actor) {
    requireAdmin(actor);
    return jdbc.sql(
            "SELECT s.id,s.name,s.status,s.created_at,a.display_name,a.email FROM singflow.sessions"
                + " s JOIN singflow.host_accounts a ON a.email=s.owner WHERE s.status='OPEN' ORDER"
                + " BY s.created_at DESC,s.id")
        .query(
            (rs, n) ->
                new Summary(
                    new SessionAccess.SessionView(
                        rs.getObject(1, UUID.class),
                        rs.getString(2),
                        rs.getString(3),
                        rs.getTimestamp(4).toInstant()),
                    new Host(rs.getString(5), rs.getString(6))))
        .list();
  }

  @Transactional
  public Detail detail(String actor, UUID id) {
    requireAdmin(actor);
    // A shared snapshot under the session lock keeps the call and suggested queue coherent.
    var context = sessions.lockAudienceContext(id, true);
    var host = accounts.get(context.owner());
    return new Detail(
        context.session(),
        new Host(host.name(), host.email()),
        musicians.members(id, context.owner()),
        stage.snapshot(id, context.owner()));
  }
}
