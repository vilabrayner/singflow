package br.tec.flowave.singflow.requests;

import br.tec.flowave.singflow.audit.AuditTrail;
import br.tec.flowave.singflow.participants.Participation;
import br.tec.flowave.singflow.requests.infrastructure.*;
import br.tec.flowave.singflow.sessions.SessionAccess;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AssistedRequests {
  public record RequestView(
      UUID id, UUID participantId, String title, String artist, String status, Instant createdAt) {}

  public record Registration(Participation.ParticipantView participant, RequestView request) {}

  private final SongRequestRepository repository;
  private final SessionAccess sessions;
  private final Participation participation;
  private final AuditTrail audit;

  public AssistedRequests(
      SongRequestRepository repository,
      SessionAccess sessions,
      Participation participation,
      AuditTrail audit) {
    this.repository = repository;
    this.sessions = sessions;
    this.participation = participation;
    this.audit = audit;
  }

  private RequestView view(SongRequest r) {
    return new RequestView(r.id, r.participantId, r.title, r.artist, r.status, r.createdAt);
  }

  @Transactional(readOnly = true)
  public List<RequestView> list(UUID session, String actor) {
    sessions.requireOwned(session, actor);
    return repository.findBySessionIdOrderByCreatedAtAscIdAsc(session).stream()
        .map(this::view)
        .toList();
  }

  @Transactional
  public Registration register(
      UUID session,
      String actor,
      UUID operation,
      String name,
      String table,
      String title,
      String artist) {
    var p = participation.register(session, actor, operation, name, table);
    return new Registration(p, add(session, actor, p.id(), operation, title, artist));
  }

  @Transactional
  public RequestView add(
      UUID session, String actor, UUID participant, UUID operation, String title, String artist) {
    participation.requireActive(session, actor, participant);
    String cleanArtist = artist == null || artist.isBlank() ? null : artist.strip();
    var previous = repository.findById(operation);
    if (previous.isPresent()) {
      var r = previous.get();
      if (!r.sessionId.equals(session)
          || !r.participantId.equals(participant)
          || !r.title.equals(title.strip())
          || !Objects.equals(r.artist, cleanArtist))
        throw new ResponseStatusException(HttpStatus.CONFLICT, "Identificador já utilizado.");
      return view(r);
    }
    var r =
        repository.saveAndFlush(
            new SongRequest(operation, session, participant, title.strip(), cleanArtist));
    audit.record(actor, session, "ASSISTED_REQUEST_CREATED", operation);
    return view(r);
  }

  @Transactional
  public Participation.ParticipantView leave(UUID session, String actor, UUID participant) {
    var result = participation.leave(session, actor, participant);
    repository
        .findBySessionIdAndParticipantIdAndStatus(session, participant, "PENDING")
        .forEach(
            r -> {
              r.status = "CANCELLED";
              audit.record(actor, session, "REQUEST_CANCELLED_ON_EXIT", r.id);
            });
    return result;
  }
}
