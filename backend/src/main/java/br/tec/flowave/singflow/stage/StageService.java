package br.tec.flowave.singflow.stage;

import br.tec.flowave.singflow.audit.AuditTrail;
import br.tec.flowave.singflow.participants.*;
import br.tec.flowave.singflow.requests.AssistedRequests;
import br.tec.flowave.singflow.sessions.*;
import br.tec.flowave.singflow.stage.domain.StageRanking;
import br.tec.flowave.singflow.stage.domain.StageRanking.Candidate;
import br.tec.flowave.singflow.stage.infrastructure.StageStore;
import br.tec.flowave.singflow.stage.infrastructure.StageStore.Call;
import java.time.Instant;
import java.util.*;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@Service
public class StageService {
  public record Suggestion(
      UUID participantId,
      String name,
      String tableLabel,
      int completed,
      UUID requestId,
      String title,
      String artist,
      String reason) {}

  public record CallView(
      UUID id,
      UUID participantId,
      String participantName,
      UUID requestId,
      String title,
      String artist,
      String status,
      Instant createdAt,
      Instant resolvedAt) {}

  public record WaitView(UUID participantId, String name, boolean manualRelease, int remaining) {}

  public record StageView(
      List<Suggestion> suggestions,
      CallView active,
      List<CallView> history,
      List<WaitView> waits) {}

  private final StageStore store;
  private final SessionAccess sessions;
  private final Participation participants;
  private final AssistedRequests requests;
  private final AuditTrail audit;

  public StageService(
      StageStore store,
      SessionAccess sessions,
      Participation participants,
      AssistedRequests requests,
      AuditTrail audit) {
    this.store = store;
    this.sessions = sessions;
    this.participants = participants;
    this.requests = requests;
    this.audit = audit;
  }

  private ResponseStatusException conflict(String message) {
    return new ResponseStatusException(HttpStatus.CONFLICT, message);
  }

  private Participation.ParticipantView person(UUID session, String actor, UUID id) {
    return participants.list(session, actor).stream()
        .filter(p -> p.id().equals(id))
        .findFirst()
        .orElseThrow(
            () ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Participante não encontrado."));
  }

  private Optional<Call> active(UUID session) {
    return store.calls(session).stream().filter(c -> c.status().equals("CALLED")).findFirst();
  }

  private CallView view(Call c, List<Participation.ParticipantView> people) {
    String name =
        people.stream()
            .filter(p -> p.id().equals(c.participantId()))
            .map(Participation.ParticipantView::name)
            .findFirst()
            .orElse("Participante");
    return new CallView(
        c.id(),
        c.participantId(),
        name,
        c.requestId(),
        c.title(),
        c.artist(),
        c.status(),
        c.createdAt(),
        c.resolvedAt());
  }

  private List<Candidate> ranked(UUID session, String actor) {
    if (!sessions.requireOwned(session, actor).status().equals("OPEN")) return List.of();
    var calls = store.calls(session);
    var current =
        calls.stream()
            .filter(c -> c.status().equals("CALLED"))
            .map(Call::participantId)
            .findFirst()
            .orElse(null);
    UUID last =
        calls.stream()
            .filter(c -> c.status().equals("COMPLETED"))
            .max(Comparator.comparingLong(Call::resolutionOrder))
            .map(Call::participantId)
            .orElse(null);
    var pending =
        requests.list(session, actor).stream().filter(r -> r.status().equals("PENDING")).toList();
    var eligible = new ArrayList<Candidate>();
    for (var p : participants.list(session, actor)) {
      if (!p.status().equals("ACTIVE") || p.id().equals(current)) continue;
      var request =
          pending.stream().filter(r -> r.participantId().equals(p.id())).findFirst().orElse(null);
      eligible.add(
          new Candidate(
              p.id(),
              p.name(),
              p.tableLabel(),
              p.completedPerformances(),
              p.checkInOrder(),
              request == null ? null : request.id(),
              request == null ? null : request.title(),
              request == null ? null : request.artist()));
    }
    return StageRanking.rank(eligible, last);
  }

  @Transactional
  public StageView snapshot(UUID session, String actor) {
    sessions.lockOwned(session, actor, false);
    var people = participants.list(session, actor);
    var calls = store.calls(session);
    var blockers = store.blockers(session);
    var suggestions =
        ranked(session, actor).stream()
            .map(
                c ->
                    new Suggestion(
                        c.participantId(),
                        c.name(),
                        c.tableLabel(),
                        c.completed(),
                        c.requestId(),
                        c.title(),
                        c.artist(),
                        c.completed()
                            + " apresentações concluídas · "
                            + (c.requestId() == null ? "música a escolher" : "pedido pendente")
                            + " · desempate: evitar repetição, pedido e chegada"))
            .toList();
    var waits =
        store.waits(session).stream()
            .map(
                w ->
                    new WaitView(
                        w.participantId(),
                        person(session, actor, w.participantId()).name(),
                        w.manualRelease(),
                        (int)
                            blockers.stream()
                                .filter(b -> b.waitingId().equals(w.participantId()))
                                .count()))
            .toList();
    return new StageView(
        suggestions,
        calls.stream()
            .filter(c -> c.status().equals("CALLED"))
            .map(c -> view(c, people))
            .findFirst()
            .orElse(null),
        calls.stream().filter(c -> !c.status().equals("CALLED")).map(c -> view(c, people)).toList(),
        waits);
  }

  @Transactional
  public StageView confirm(
      UUID session, String actor, UUID operation, UUID participant, UUID expectedRequest) {
    sessions.lockOwned(session, actor, true);
    var previous = store.calls(session).stream().filter(c -> c.id().equals(operation)).findFirst();
    if (previous.isPresent()) {
      if (!previous.get().participantId().equals(participant)
          || !Objects.equals(previous.get().requestId(), expectedRequest))
        throw conflict("Identificador já utilizado.");
      return snapshot(session, actor);
    }
    if (active(session).isPresent())
      throw conflict("Resolva a convocação atual antes de chamar outra pessoa.");
    var suggestions = ranked(session, actor);
    if (suggestions.isEmpty()) throw conflict("Não há participante elegível.");
    var next = suggestions.getFirst();
    if (!next.participantId().equals(participant)
        || !Objects.equals(next.requestId(), expectedRequest))
      throw conflict("A sugestão mudou. Atualize a lista antes de confirmar.");
    if (expectedRequest != null)
      requests.transitionForStage(session, actor, expectedRequest, "PENDING", "RESERVED");
    store.insert(operation, session, participant, expectedRequest, next.title(), next.artist());
    audit.record(actor, session, "CALL_CONFIRMED", operation);
    return snapshot(session, actor);
  }

  @Transactional
  public StageView resolve(
      UUID session,
      String actor,
      UUID id,
      String outcome,
      String selectedTitle,
      String selectedArtist) {
    sessions.lockOwned(session, actor, true);
    if (!Set.of("COMPLETED", "ABSENT", "DECLINED", "CANCELLED").contains(outcome))
      throw conflict("Resultado inválido.");
    var call =
        store.calls(session).stream()
            .filter(c -> c.id().equals(id))
            .findFirst()
            .orElseThrow(
                () ->
                    new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Convocação não encontrada."));
    String title = call.requestId() == null ? clean(selectedTitle) : call.title();
    String artist = call.requestId() == null ? clean(selectedArtist) : call.artist();
    if (!call.status().equals("CALLED")) {
      if (!call.status().equals(outcome))
        throw conflict("Esta convocação já foi resolvida com outro resultado.");
      if (outcome.equals("COMPLETED")
          && (!Objects.equals(call.title(), title) || !Objects.equals(call.artist(), artist)))
        throw conflict("A apresentação já foi concluída com outra música.");
      return snapshot(session, actor);
    }
    if (outcome.equals("COMPLETED") && title == null)
      throw conflict("Informe a música antes de concluir.");
    if (title != null && title.length() > 160 || artist != null && artist.length() > 160)
      throw conflict("Música e artista devem ter até 160 caracteres.");
    finish(session, actor, call, outcome, title, artist);
    return snapshot(session, actor);
  }

  private String clean(String value) {
    return value == null || value.isBlank() ? null : value.strip();
  }

  private void finish(
      UUID session, String actor, Call call, String outcome, String title, String artist) {
    finishAs(session, actor, call, outcome, title, artist, actor);
  }

  private void finishAs(
      UUID session,
      String actor,
      Call call,
      String outcome,
      String title,
      String artist,
      String auditActor) {
    var p = person(session, actor, call.participantId());
    if (outcome.equals("COMPLETED"))
      participants.updateStage(session, actor, p.id(), "ACTIVE", 1, 0, false);
    if (outcome.equals("ABSENT"))
      participants.updateStage(
          session,
          actor,
          p.id(),
          p.consecutiveAbsences() + 1 >= 2 ? "INACTIVE" : "SUSPENDED",
          0,
          Math.min(2, p.consecutiveAbsences() + 1),
          false);
    if (outcome.equals("DECLINED"))
      participants.updateStage(session, actor, p.id(), "PAUSED", 0, p.consecutiveAbsences(), false);
    if (call.requestId() != null)
      requests.transitionForStage(
          session,
          actor,
          call.requestId(),
          "RESERVED",
          outcome.equals("COMPLETED")
              ? "COMPLETED"
              : outcome.equals("LEFT") ? "CANCELLED" : "PENDING");
    if (outcome.equals("ABSENT") && p.consecutiveAbsences() + 1 >= 2)
      requests.transitionParticipantRequests(session, actor, p.id(), "PENDING", "SUSPENDED");
    store.resolve(session, call.id(), outcome, title, artist);
    audit.record(auditActor, session, "CALL_" + outcome, call.id());
    if (outcome.equals("ABSENT") && p.consecutiveAbsences() == 0) {
      var blockers =
          participants.list(session, actor).stream()
              .filter(other -> other.status().equals("ACTIVE") && !other.id().equals(p.id()))
              .map(Participation.ParticipantView::id)
              .toList();
      store.waitFor(session, p.id(), blockers);
    }
    if (!outcome.equals("CANCELLED")) progress(session, actor, p.id());
  }

  private void progress(UUID session, String actor, UUID served) {
    var people = participants.list(session, actor);
    var activeIds =
        people.stream()
            .filter(p -> p.status().equals("ACTIVE"))
            .map(Participation.ParticipantView::id)
            .collect(java.util.stream.Collectors.toSet());
    for (var b : store.blockers(session))
      if (b.blockerId().equals(served) || !activeIds.contains(b.blockerId()))
        store.removeBlocker(session, b.waitingId(), b.blockerId());
    var remaining = store.blockers(session);
    for (var wait : store.waits(session)) {
      var p =
          people.stream()
              .filter(v -> v.id().equals(wait.participantId()))
              .findFirst()
              .orElseThrow();
      if (!p.status().equals("SUSPENDED")) {
        store.removeWait(session, p.id());
        continue;
      }
      if (!wait.manualRelease()
          && remaining.stream().noneMatch(b -> b.waitingId().equals(p.id()))) {
        participants.updateStage(
            session, actor, p.id(), "ACTIVE", 0, p.consecutiveAbsences(), false);
        store.removeWait(session, p.id());
        audit.record(actor, session, "ABSENCE_ROUND_FINISHED", p.id());
      }
    }
  }

  @Transactional
  public StageView availability(UUID session, String actor, UUID id, String action) {
    sessions.lockOwned(session, actor, true);
    var p = person(session, actor, id);
    if (active(session).filter(c -> c.participantId().equals(id)).isPresent())
      throw conflict("Resolva a convocação da pessoa antes de alterar sua participação.");
    if (action.equals("pause")) {
      if (p.status().equals("PAUSED")) return snapshot(session, actor);
      if (!p.status().equals("ACTIVE"))
        throw conflict("Somente uma participação ativa pode ser pausada.");
      participants.updateStage(session, actor, id, "PAUSED", 0, p.consecutiveAbsences(), false);
    } else if (action.equals("resume")) {
      if (p.status().equals("ACTIVE")) return snapshot(session, actor);
      if (!p.status().equals("PAUSED") && !p.status().equals("SUSPENDED"))
        throw conflict("Use reativar para uma participação encerrada.");
      if (p.status().equals("SUSPENDED")
          && store.blockers(session).stream().anyMatch(b -> b.waitingId().equals(id)))
        throw conflict("Aguarde a rodada dos demais participantes.");
      participants.updateStage(session, actor, id, "ACTIVE", 0, p.consecutiveAbsences(), false);
      store.removeWait(session, id);
    } else if (action.equals("reactivate")) {
      if (p.status().equals("ACTIVE")) return snapshot(session, actor);
      if (!Set.of("LEFT", "INACTIVE").contains(p.status()))
        throw conflict("Use retomar para uma pausa.");
      participants.updateStage(session, actor, id, "ACTIVE", 0, 0, true);
      store.removeWait(session, id);
      if (p.status().equals("INACTIVE"))
        requests.transitionParticipantRequests(session, actor, id, "SUSPENDED", "PENDING");
    } else throw conflict("Ação inválida.");
    audit.record(actor, session, "PARTICIPANT_" + action.toUpperCase(Locale.ROOT), id);
    progress(session, actor, null);
    return snapshot(session, actor);
  }

  @EventListener
  @Transactional(propagation = Propagation.MANDATORY)
  public void onClosing(SessionClosing event) {
    if (active(event.sessionId()).isPresent())
      throw conflict("Conclua ou cancele a convocação antes de encerrar a sessão.");
  }

  @EventListener
  @Transactional(propagation = Propagation.MANDATORY)
  public void onLeaving(ParticipantLeaving event) {
    var call =
        active(event.sessionId()).filter(c -> c.participantId().equals(event.participantId()));
    if (call.isPresent())
      finishAs(
          event.sessionId(),
          event.actor(),
          call.get(),
          "LEFT",
          call.get().title(),
          call.get().artist(),
          event.auditActor());
    store.removeWait(event.sessionId(), event.participantId());
    if (sessions.requireOwned(event.sessionId(), event.actor()).status().equals("OPEN"))
      progress(event.sessionId(), event.actor(), event.participantId());
  }
}
