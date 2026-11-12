package br.tec.flowave.singflow.requests;

import br.tec.flowave.singflow.audit.AuditTrail;
import br.tec.flowave.singflow.catalog.CatalogService;
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
      UUID id,
      UUID participantId,
      String title,
      String artist,
      String status,
      Instant createdAt,
      UUID catalogSongId) {}

  public record Registration(Participation.ParticipantView participant, RequestView request) {}

  private final SongRequestRepository repository;
  private final SessionAccess sessions;
  private final Participation participation;
  private final AuditTrail audit;
  private final CatalogService catalog;
  private final org.springframework.jdbc.core.simple.JdbcClient jdbc;

  public AssistedRequests(
      SongRequestRepository repository,
      SessionAccess sessions,
      Participation participation,
      AuditTrail audit,
      CatalogService catalog,
      org.springframework.jdbc.core.simple.JdbcClient jdbc) {
    this.repository = repository;
    this.sessions = sessions;
    this.participation = participation;
    this.audit = audit;
    this.catalog = catalog;
    this.jdbc = jdbc;
  }

  private RequestView view(SongRequest r) {
    return new RequestView(
        r.id, r.participantId, r.title, r.artist, r.status, r.createdAt, r.catalogSongId);
  }

  @Transactional(readOnly = true)
  public List<RequestView> list(UUID session, String actor) {
    sessions.requireOwned(session, actor);
    return repository.findBySessionIdOrderByRequestOrderAscCreatedAtAscIdAsc(session).stream()
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
    return register(session, actor, operation, name, table, title, artist, null);
  }

  @Transactional
  public Registration register(
      UUID session,
      String actor,
      UUID operation,
      String name,
      String table,
      String title,
      String artist,
      String selectionToken) {
    var p = participation.register(session, actor, operation, name, table);
    return new Registration(
        p, add(session, actor, p.id(), operation, title, artist, selectionToken));
  }

  @Transactional
  public RequestView add(
      UUID session, String actor, UUID participant, UUID operation, String title, String artist) {
    return add(session, actor, participant, operation, title, artist, null);
  }

  @Transactional
  public RequestView add(
      UUID session,
      String actor,
      UUID participant,
      UUID operation,
      String title,
      String artist,
      String selectionToken) {
    return addAs(
        session, actor, participant, operation, title, artist, actor, "ASSISTED", selectionToken);
  }

  @Transactional
  public Registration registerSelf(
      UUID session,
      String owner,
      UUID participant,
      String name,
      String table,
      String title,
      String artist) {
    return registerSelf(session, owner, participant, name, table, title, artist, null);
  }

  @Transactional
  public Registration registerSelf(
      UUID session,
      String owner,
      UUID participant,
      String name,
      String table,
      String title,
      String artist,
      String selectionToken) {
    var p = participation.registerSelf(session, owner, participant, name, table);
    return new Registration(
        p, addSelf(session, owner, participant, participant, title, artist, selectionToken));
  }

  @Transactional
  public RequestView addSelf(
      UUID session, String owner, UUID participant, UUID operation, String title, String artist) {
    return addSelf(session, owner, participant, operation, title, artist, null);
  }

  @Transactional
  public RequestView addSelf(
      UUID session,
      String owner,
      UUID participant,
      UUID operation,
      String title,
      String artist,
      String selectionToken) {
    return addAs(
        session,
        owner,
        participant,
        operation,
        title,
        artist,
        "participant:" + participant,
        "SELF",
        selectionToken);
  }

  private RequestView addAs(
      UUID session,
      String actor,
      UUID participant,
      UUID operation,
      String title,
      String artist,
      String auditActor,
      String origin,
      String selectionToken) {
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
    var request = new SongRequest(operation, session, participant, title.strip(), cleanArtist);
    request.catalogSongId = catalog.register(title, cleanArtist, auditActor, selectionToken);
    var r = repository.saveAndFlush(request);
    audit.record(auditActor, session, origin + "_REQUEST_CREATED", operation);
    return view(r);
  }

  @Transactional
  public void reorder(
      UUID session,
      String owner,
      UUID participant,
      UUID operation,
      List<UUID> expected,
      List<UUID> ordered) {
    participation.requireActive(session, owner, participant);
    if (expected == null
        || ordered == null
        || expected.isEmpty()
        || expected.size() > 100
        || !new HashSet<>(expected).equals(new HashSet<>(ordered))
        || new HashSet<>(ordered).size() != ordered.size()
        || expected.size() != ordered.size())
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Confira a lista de músicas para reordenar.");
    var previous =
        jdbc.sql(
                "SELECT session_id,participant_id,expected_ids,ordered_ids FROM"
                    + " singflow.request_reorders WHERE operation_id=?")
            .param(operation)
            .query(
                (rs, n) ->
                    List.of(
                        rs.getObject(1, UUID.class),
                        rs.getObject(2, UUID.class),
                        List.of((UUID[]) rs.getArray(3).getArray()),
                        List.of((UUID[]) rs.getArray(4).getArray())))
            .optional();
    if (previous.isPresent()) {
      if (!previous.get().equals(List.of(session, participant, expected, ordered)))
        throw new ResponseStatusException(HttpStatus.CONFLICT, "Identificador já utilizado.");
      return;
    }
    var pending =
        repository.findBySessionIdOrderByRequestOrderAscCreatedAtAscIdAsc(session).stream()
            .filter(r -> r.participantId.equals(participant) && r.status.equals("PENDING"))
            .toList();
    if (!pending.stream().map(r -> r.id).toList().equals(expected))
      throw new ResponseStatusException(
          HttpStatus.CONFLICT,
          "As músicas mudaram ou uma já foi convocada. A lista será atualizada.");
    for (int i = 0; i < ordered.size(); i++)
      jdbc.sql(
              "UPDATE singflow.song_requests SET request_order=? WHERE id=? AND session_id=? AND"
                  + " participant_id=? AND status='PENDING'")
          .params(pending.get(i).requestOrder, ordered.get(i), session, participant)
          .update();
    jdbc.sql(
            "INSERT INTO singflow.request_reorders VALUES(?,?,?,cast(? AS uuid[]),cast(? AS"
                + " uuid[]))")
        .params(
            operation,
            session,
            participant,
            "{" + String.join(",", expected.stream().map(UUID::toString).toList()) + "}",
            "{" + String.join(",", ordered.stream().map(UUID::toString).toList()) + "}")
        .update();
    audit.record("participant:" + participant, session, "REQUESTS_REORDERED", operation);
  }

  @Transactional
  public Participation.ParticipantView leave(UUID session, String actor, UUID participant) {
    return leaveAs(session, actor, participant, actor);
  }

  @Transactional
  public Participation.ParticipantView leaveAs(
      UUID session, String actor, UUID participant, String auditActor) {
    var result = participation.leaveAs(session, actor, participant, auditActor);
    cancelOnExit(session, participant, auditActor);
    return result;
  }

  @Transactional
  public Participation.ParticipantView leaveSelf(UUID session, String owner, UUID participant) {
    var result = participation.leaveSelf(session, owner, participant);
    cancelOnExit(session, participant, "participant:" + participant);
    return result;
  }

  private void cancelOnExit(UUID session, UUID participant, String auditActor) {
    repository.findBySessionIdOrderByRequestOrderAscCreatedAtAscIdAsc(session).stream()
        .filter(
            r ->
                r.participantId.equals(participant)
                    && Set.of("PENDING", "SUSPENDED").contains(r.status))
        .forEach(
            r -> {
              r.status = "CANCELLED";
              audit.record(auditActor, session, "REQUEST_CANCELLED_ON_EXIT", r.id);
            });
    repository.flush();
  }

  @Transactional
  public void editSelf(
      UUID session,
      String owner,
      UUID participant,
      UUID id,
      String expectedTitle,
      String expectedArtist,
      String title,
      String artist,
      String selectionToken) {
    participation.requireActive(session, owner, participant);
    var r =
        repository
            .findById(id)
            .filter(
                item -> item.sessionId.equals(session) && item.participantId.equals(participant))
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Pedido não encontrado."));
    if (!r.status.equals("PENDING"))
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "Somente pedidos pendentes podem ser alterados. Atualize a lista.");
    String cleanTitle = title.strip();
    String cleanArtist = artist == null || artist.isBlank() ? null : artist.strip();
    if (r.title.equals(cleanTitle) && Objects.equals(r.artist, cleanArtist)) return;
    String previousArtist =
        expectedArtist == null || expectedArtist.isBlank() ? null : expectedArtist.strip();
    if (!r.title.equals(expectedTitle.strip()) || !Objects.equals(r.artist, previousArtist))
      throw new ResponseStatusException(
          HttpStatus.CONFLICT,
          "Este pedido foi alterado. Atualize a lista antes de tentar novamente.");
    r.catalogSongId =
        catalog.register(cleanTitle, cleanArtist, "participant:" + participant, selectionToken);
    r.title = cleanTitle;
    r.artist = cleanArtist;
    repository.flush();
    audit.record("participant:" + participant, session, "SELF_REQUEST_EDITED", id);
  }

  @Transactional
  public void cancelSelf(UUID session, String owner, UUID participant, UUID id) {
    sessions.lockOwned(session, owner, true);
    var r =
        repository
            .findById(id)
            .filter(
                item -> item.sessionId.equals(session) && item.participantId.equals(participant))
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Pedido não encontrado."));
    if (r.status.equals("CANCELLED")) return;
    if (!r.status.equals("PENDING"))
      throw new ResponseStatusException(
          HttpStatus.CONFLICT,
          "Somente pedidos pendentes podem ser cancelados. Fale com o anfitrião.");
    r.status = "CANCELLED";
    repository.flush();
    audit.record("participant:" + participant, session, "SELF_REQUEST_CANCELLED", id);
  }

  /** Narrow module API for reserving/releasing a request under the session lock. */
  @Transactional
  public void transitionForStage(
      UUID session, String actor, UUID id, String expected, String target) {
    sessions.lockOwned(session, actor, true);
    var r =
        repository
            .findById(id)
            .filter(item -> item.sessionId.equals(session))
            .orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Pedido não encontrado."));
    if (!r.status.equals(expected))
      throw new ResponseStatusException(HttpStatus.CONFLICT, "O pedido mudou. Atualize a lista.");
    if (!Set.of("PENDING", "RESERVED", "COMPLETED", "SUSPENDED", "CANCELLED").contains(target))
      throw new IllegalArgumentException("Invalid request status");
    r.status = target;
    repository.flush();
    audit.record(actor, session, "REQUEST_" + target, id);
  }

  @Transactional
  public void transitionParticipantRequests(
      UUID session, String actor, UUID participant, String from, String to) {
    sessions.lockOwned(session, actor, true);
    for (var r : repository.findBySessionIdAndParticipantIdAndStatus(session, participant, from)) {
      r.status = to;
      audit.record(actor, session, "REQUEST_" + to, r.id);
    }
    repository.flush();
  }
}
