package br.tec.flowave.singflow.sessions;

import br.tec.flowave.singflow.audit.AuditTrail;
import br.tec.flowave.singflow.sessions.infrastructure.*;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class SessionAccess {
  public record SessionView(UUID id, String name, String status, Instant createdAt) {}

  private final SessionRepository repository;
  private final AuditTrail audit;
  private final org.springframework.context.ApplicationEventPublisher events;

  public SessionAccess(
      SessionRepository repository,
      AuditTrail audit,
      org.springframework.context.ApplicationEventPublisher events) {
    this.repository = repository;
    this.audit = audit;
    this.events = events;
  }

  private SessionView view(KaraokeSession s) {
    return new SessionView(s.id, s.name, s.status, s.createdAt);
  }

  @Transactional(readOnly = true)
  public List<SessionView> list(String owner) {
    return repository.findByOwnerOrderByCreatedAtDesc(owner).stream().map(this::view).toList();
  }

  @Transactional(readOnly = true)
  public SessionView requireOwned(UUID id, String owner) {
    return view(
        repository
            .findByIdAndOwner(id, owner)
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sessão não encontrada.")));
  }

  @Transactional
  public void lockOwned(UUID id, String owner, boolean requireOpen) {
    var s =
        repository
            .lockOwned(id, owner)
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sessão não encontrada."));
    if (requireOpen && !s.status.equals("OPEN"))
      throw new ResponseStatusException(HttpStatus.CONFLICT, "A sessão precisa estar aberta.");
  }

  @Transactional
  public SessionView create(String owner, String name, UUID id) {
    var existing = repository.findByIdAndOwner(id, owner);
    if (existing.isPresent()) {
      if (!existing.get().name.equals(name.strip()))
        throw new ResponseStatusException(HttpStatus.CONFLICT, "Identificador já utilizado.");
      return view(existing.get());
    }
    var s = repository.saveAndFlush(new KaraokeSession(id, owner, name.strip()));
    audit.record(owner, id, "SESSION_CREATED", id);
    return view(s);
  }

  @Transactional
  public SessionView transition(UUID id, String owner, String target) {
    var s =
        repository
            .lockOwned(id, owner)
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sessão não encontrada."));
    if (s.status.equals(target)) return view(s);
    if (s.status.equals("CLOSED") || (!target.equals("OPEN") && !target.equals("CLOSED")))
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Transição inválida.");
    if (target.equals("CLOSED")) events.publishEvent(new SessionClosing(id, owner));
    s.status = target;
    audit.record(owner, id, "SESSION_" + target, id);
    return view(s);
  }
}
