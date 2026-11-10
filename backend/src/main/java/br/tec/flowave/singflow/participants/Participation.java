package br.tec.flowave.singflow.participants;

import br.tec.flowave.singflow.audit.AuditTrail;
import br.tec.flowave.singflow.participants.infrastructure.*;
import br.tec.flowave.singflow.sessions.SessionAccess;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class Participation {
  public record ParticipantView(
      UUID id,
      String name,
      String tableLabel,
      String status,
      String origin,
      Instant checkedInAt,
      long checkInOrder,
      int completedPerformances,
      int consecutiveAbsences,
      Instant queueJoinedAt) {}

  private final ParticipantRepository repository;
  private final SessionAccess sessions;
  private final AuditTrail audit;
  private final org.springframework.context.ApplicationEventPublisher events;

  public Participation(
      ParticipantRepository repository,
      SessionAccess sessions,
      AuditTrail audit,
      org.springframework.context.ApplicationEventPublisher events) {
    this.repository = repository;
    this.sessions = sessions;
    this.audit = audit;
    this.events = events;
  }

  private ParticipantView view(Participant p) {
    return new ParticipantView(
        p.id,
        p.name,
        p.tableLabel,
        p.status,
        p.origin,
        p.checkedInAt,
        p.queueOrder,
        p.completedPerformances,
        p.consecutiveAbsences,
        p.queueJoinedAt);
  }

  @Transactional(readOnly = true)
  public List<ParticipantView> list(UUID session, String actor) {
    sessions.requireOwned(session, actor);
    return repository.findBySessionIdOrderByQueueOrderAsc(session).stream()
        .map(this::view)
        .toList();
  }

  @Transactional
  public ParticipantView register(UUID session, String actor, UUID id, String name, String table) {
    sessions.lockOwned(session, actor, true);
    var previous = repository.findByIdAndSessionId(id, session);
    String cleanTable = table == null || table.isBlank() ? null : table.strip();
    if (previous.isPresent()) {
      var p = previous.get();
      if (!p.name.equals(name.strip()) || !Objects.equals(p.tableLabel, cleanTable))
        throw new ResponseStatusException(HttpStatus.CONFLICT, "Identificador já utilizado.");
      return view(p);
    }
    var p = repository.saveAndFlush(new Participant(id, session, name.strip(), cleanTable));
    // Refresh generated server sequence, used as deterministic check-in order.
    entityManager.refresh(p);
    audit.record(actor, session, "ASSISTED_CHECK_IN", id);
    return view(p);
  }

  @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager entityManager;

  @Transactional
  public ParticipantView requireActive(UUID session, String actor, UUID id) {
    sessions.lockOwned(session, actor, true);
    var p =
        repository
            .findByIdAndSessionId(id, session)
            .orElseThrow(
                () ->
                    new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Participante não encontrado."));
    if (!p.status.equals("ACTIVE"))
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Participante saiu da sessão.");
    return view(p);
  }

  @Transactional
  public ParticipantView leave(UUID session, String actor, UUID id) {
    sessions.lockOwned(session, actor, false);
    var p =
        repository
            .findByIdAndSessionId(id, session)
            .orElseThrow(
                () ->
                    new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Participante não encontrado."));
    if (!p.status.equals("LEFT")) {
      p.status = "LEFT";
      audit.record(actor, session, "PARTICIPANT_LEFT", id);
      events.publishEvent(new ParticipantLeaving(session, id, actor));
    }
    return view(p);
  }

  /** Called only by stage use cases while the owning session is transactionally locked. */
  @Transactional
  public ParticipantView updateStage(
      UUID session,
      String actor,
      UUID id,
      String status,
      int completedDelta,
      int absences,
      boolean newArrival) {
    sessions.lockOwned(session, actor, true);
    if (!Set.of("ACTIVE", "PAUSED", "SUSPENDED", "INACTIVE", "LEFT").contains(status)
        || completedDelta < 0
        || completedDelta > 1
        || absences < 0
        || absences > 2) throw new IllegalArgumentException("Invalid stage transition");
    var p =
        repository
            .findByIdAndSessionId(id, session)
            .orElseThrow(
                () ->
                    new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Participante não encontrado."));
    p.status = status;
    p.completedPerformances += completedDelta;
    p.consecutiveAbsences = absences;
    if (newArrival) {
      p.queueOrder =
          ((Number)
                  entityManager
                      .createNativeQuery("SELECT nextval('singflow.participant_queue_order_seq')")
                      .getSingleResult())
              .longValue();
      p.queueJoinedAt = Instant.now();
    }
    repository.flush();
    return view(p);
  }
}
