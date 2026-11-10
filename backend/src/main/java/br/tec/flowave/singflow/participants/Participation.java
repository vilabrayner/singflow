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
      int completedPerformances) {}

  private final ParticipantRepository repository;
  private final SessionAccess sessions;
  private final AuditTrail audit;

  public Participation(ParticipantRepository repository, SessionAccess sessions, AuditTrail audit) {
    this.repository = repository;
    this.sessions = sessions;
    this.audit = audit;
  }

  private ParticipantView view(Participant p) {
    return new ParticipantView(
        p.id,
        p.name,
        p.tableLabel,
        p.status,
        p.origin,
        p.checkedInAt,
        p.checkInOrder,
        p.completedPerformances);
  }

  @Transactional(readOnly = true)
  public List<ParticipantView> list(UUID session, String actor) {
    sessions.requireOwned(session, actor);
    return repository.findBySessionIdOrderByCheckInOrderAsc(session).stream()
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
    }
    return view(p);
  }
}
