package br.tec.flowave.singflow.audit;

import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class AuditTrail {
  private final JdbcClient jdbc;

  private final org.springframework.context.ApplicationEventPublisher events;
  public AuditTrail(JdbcClient jdbc, org.springframework.context.ApplicationEventPublisher events) {
    this.jdbc = jdbc;
    this.events = events;
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public void record(String actor, UUID session, String action, UUID target) {
    jdbc.sql(
            "INSERT INTO singflow.audit_events(id, actor, session_id, action, target_id) VALUES"
                + " (:id,:actor,:session,:action,:target)")
        .param("id", UUID.randomUUID())
        .param("actor", actor)
        .param("session", session)
        .param("action", action)
        .param("target", target)
        .update();
    events.publishEvent(new SessionChanged(session));
  }
}
