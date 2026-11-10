package br.tec.flowave.singflow;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import br.tec.flowave.singflow.requests.AssistedRequests;
import java.util.UUID;
import java.util.concurrent.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@Testcontainers
@SpringBootTest(properties = {"SINGFLOW_HOST_EMAIL=", "SINGFLOW_HOST_PASSWORD="})
@AutoConfigureMockMvc
class SingflowApplicationTests {
  @Container @ServiceConnection
  static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17.6");

  @Autowired MockMvc mvc;
  @Autowired Flyway flyway;

  @Test
  void migratesRealPostgres() {
    assertThat(flyway.info().applied()).hasSize(7);
    assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
  }

  @Test
  void exposesOnlyPublicHealth() throws Exception {
    mvc.perform(get("/actuator/health"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("UP"))
        .andExpect(jsonPath("$.components").doesNotExist());
    mvc.perform(get("/api/sessions")).andExpect(status().isUnauthorized());
    mvc.perform(get("/v3/api-docs")).andExpect(status().isUnauthorized());
    mvc.perform(post("/api/sessions")).andExpect(status().isForbidden());
  }

  @Autowired JdbcClient jdbc;
  @Autowired PasswordEncoder encoder;
  @Autowired AssistedRequests assistedRequests;

  private String host() {
    String email = UUID.randomUUID() + "@example.test";
    jdbc.sql("INSERT INTO singflow.host_accounts(email,password_hash) VALUES (?,?)")
        .params(email, encoder.encode("test-password-2026"))
        .update();
    return email;
  }

  private void createOpen(UUID id, String owner) throws Exception {
    mvc.perform(
            post("/api/sessions")
                .with(user(owner).roles("HOST"))
                .with(csrf())
                .contentType("application/json")
                .content("{\"operationId\":\"" + id + "\",\"name\":\"Café Tão\"}"))
        .andExpect(status().isOk());
    mvc.perform(post("/api/sessions/" + id + "/open").with(user(owner).roles("HOST")).with(csrf()))
        .andExpect(status().isOk());
  }

  @Test
  void authenticatesAndLogsOutWithoutBasicAuth() throws Exception {
    String owner = host();
    mvc.perform(
            post("/api/auth/login").with(csrf()).param("email", owner).param("password", "wrong"))
        .andExpect(status().isUnauthorized());
    var result =
        mvc.perform(
                post("/api/auth/login")
                    .with(csrf())
                    .param("email", owner)
                    .param("password", "test-password-2026"))
            .andExpect(status().isNoContent())
            .andReturn();
    var session = (MockHttpSession) result.getRequest().getSession(false);
    assertThat(session).isNotNull();
    mvc.perform(get("/api/auth/me").session(session))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.email").value(owner));
    mvc.perform(post("/api/auth/logout").session(session).with(csrf()))
        .andExpect(status().isNoContent());
    mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
  }

  @Test
  void assistedJourneyIsIdempotentIsolatedAndPreservesHistory() throws Exception {
    String owner = host(), other = host();
    UUID session = UUID.randomUUID(), participant = UUID.randomUUID(), second = UUID.randomUUID();
    createOpen(session, owner);
    String base = "/api/sessions/" + session;
    String body =
        "{\"operationId\":\""
            + participant
            + "\",\"name\":\"Ana\",\"tableLabel\":\"3\",\"title\":\"Evidências\"}";
    for (int i = 0; i < 2; i++)
      mvc.perform(
              post(base + "/participants")
                  .with(user(owner).roles("HOST"))
                  .with(csrf())
                  .contentType("application/json")
                  .content(body))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.participant.checkInOrder").isNumber());
    mvc.perform(
            post(base + "/participants/" + participant + "/requests")
                .with(user(owner).roles("HOST"))
                .with(csrf())
                .contentType("application/json")
                .content(
                    "{\"operationId\":\""
                        + second
                        + "\",\"title\":\"Como é grande o meu amor por você\"}"))
        .andExpect(status().isOk());
    mvc.perform(get(base + "/participants").with(user(owner).roles("HOST")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1));
    mvc.perform(get(base + "/participants").with(user(other).roles("HOST")))
        .andExpect(status().isNotFound());
    for (int i = 0; i < 2; i++)
      mvc.perform(
              post(base + "/participants/" + participant + "/leave")
                  .with(user(owner).roles("HOST"))
                  .with(csrf()))
          .andExpect(status().isOk());
    assertThat(
            jdbc.sql(
                    "SELECT count(*) FROM singflow.song_requests WHERE session_id=? AND"
                        + " status='CANCELLED'")
                .param(session)
                .query(Long.class)
                .single())
        .isEqualTo(2);
    assertThat(
            jdbc.sql(
                    "SELECT count(*) FROM singflow.audit_events WHERE session_id=? AND"
                        + " action='PARTICIPANT_LEFT'")
                .param(session)
                .query(Long.class)
                .single())
        .isEqualTo(1);
    mvc.perform(get("/api/auth/me").with(user(owner).roles("HOST"))).andExpect(status().isOk());
    mvc.perform(
            post(base + "/participants/" + participant + "/requests")
                .with(user(owner).roles("HOST"))
                .with(csrf())
                .contentType("application/json")
                .content("{\"operationId\":\"" + UUID.randomUUID() + "\",\"title\":\"Nova\"}"))
        .andExpect(status().isConflict());
  }

  @Test
  void closedSessionsAndInvalidInputsDoNotAcceptRegistrations() throws Exception {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    String base = "/api/sessions/" + session;
    mvc.perform(
            post(base + "/participants")
                .with(user(owner).roles("HOST"))
                .with(csrf())
                .contentType("application/json")
                .content(
                    "{\"operationId\":\""
                        + UUID.randomUUID()
                        + "\",\"name\":\"Ana\",\"title\":\" \"}"))
        .andExpect(status().isBadRequest());
    mvc.perform(post(base + "/close").with(user(owner).roles("HOST")).with(csrf()))
        .andExpect(status().isOk());
    mvc.perform(
            post(base + "/participants")
                .with(user(owner).roles("HOST"))
                .with(csrf())
                .contentType("application/json")
                .content(
                    "{\"operationId\":\""
                        + UUID.randomUUID()
                        + "\",\"name\":\"Ana\",\"title\":\"Música\"}"))
        .andExpect(status().isConflict());
    assertThat(
            jdbc.sql("SELECT count(*) FROM singflow.participants WHERE session_id=?")
                .param(session)
                .query(Long.class)
                .single())
        .isZero();
  }

  @Test
  void concurrentRetriesCreateOneParticipationAndOneRequest() throws Exception {
    String owner = host();
    UUID session = UUID.randomUUID(), operation = UUID.randomUUID();
    createOpen(session, owner);
    try (var executor = Executors.newFixedThreadPool(2)) {
      Callable<AssistedRequests.Registration> call =
          () -> assistedRequests.register(session, owner, operation, "Bruno", "2", "Música", null);
      var first = executor.submit(call);
      var second = executor.submit(call);
      assertThat(first.get(15, TimeUnit.SECONDS).participant().id()).isEqualTo(operation);
      assertThat(second.get(15, TimeUnit.SECONDS).participant().id()).isEqualTo(operation);
    }
    assertThat(
            jdbc.sql("SELECT count(*) FROM singflow.participants WHERE session_id=?")
                .param(session)
                .query(Long.class)
                .single())
        .isEqualTo(1);
    assertThat(
            jdbc.sql("SELECT count(*) FROM singflow.song_requests WHERE session_id=?")
                .param(session)
                .query(Long.class)
                .single())
        .isEqualTo(1);
    assertThat(
            jdbc.sql(
                    "SELECT count(*) FROM singflow.audit_events WHERE session_id=? AND"
                        + " action='ASSISTED_CHECK_IN'")
                .param(session)
                .query(Long.class)
                .single())
        .isEqualTo(1);
  }

  @Autowired br.tec.flowave.singflow.stage.StageService stage;
  @Autowired br.tec.flowave.singflow.participants.Participation participation;

  private UUID enroll(UUID session, String owner, String name) {
    UUID id = UUID.randomUUID();
    assistedRequests.register(session, owner, id, name, null, "Música de " + name, null);
    return id;
  }

  private br.tec.flowave.singflow.stage.StageService.CallView callNext(UUID session, String owner) {
    var next = stage.snapshot(session, owner).suggestions().getFirst();
    return stage
        .confirm(
            session,
            owner,
            UUID.randomUUID(),
            next.participantId(),
            next.requestId(),
            next.requestId() == null ? "Escolha no palco" : null,
            null)
        .active();
  }

  @Test
  void stageCyclesRequestsAndSuggestsRepeatsWithoutCreatingRequests() throws Exception {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    UUID a = enroll(session, owner, "Ana"),
        b = enroll(session, owner, "Bruno"),
        c = enroll(session, owner, "Carla");
    var first = callNext(session, owner);
    assertThat(first.participantId()).isEqualTo(a);
    assertThatThrownBy(() -> stage.confirm(session, owner, UUID.randomUUID(), b, b, null, null))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    mvc.perform(
            post("/api/sessions/" + session + "/close")
                .with(user(owner).roles("HOST"))
                .with(csrf()))
        .andExpect(status().isConflict());
    for (UUID expected : java.util.List.of(a, b, c)) {
      var current = stage.snapshot(session, owner).active();
      if (current == null) current = callNext(session, owner);
      assertThat(current.participantId()).isEqualTo(expected);
      stage.resolve(session, owner, current.id(), "COMPLETED");
      stage.resolve(session, owner, current.id(), "COMPLETED");
    }
    assertThat(participation.list(session, owner))
        .allSatisfy(p -> assertThat(p.completedPerformances()).isEqualTo(1));
    UUID operation = UUID.randomUUID();
    assertThatThrownBy(() -> stage.confirm(session, owner, operation, a, null, "  ", null))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    assertThat(stage.snapshot(session, owner).active()).isNull();
    var repeat =
        stage.confirm(session, owner, operation, a, null, "Escolha no palco", "Artista").active();
    assertThat(repeat.participantId()).isEqualTo(a);
    assertThat(repeat.requestId()).isNull();
    assertThat(repeat.title()).isEqualTo("Escolha no palco");
    assertThat(repeat.artist()).isEqualTo("Artista");
    assertThatThrownBy(
            () -> stage.confirm(session, owner, operation, a, null, "Outra música", null))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    stage.resolve(session, owner, repeat.id(), "COMPLETED");
    stage.resolve(session, owner, repeat.id(), "COMPLETED");
    assertThat(stage.snapshot(session, owner).history().getFirst().title())
        .isEqualTo("Escolha no palco");
    assertThat(assistedRequests.list(session, owner)).hasSize(3);
    assertThat(stage.snapshot(session, owner).history()).hasSize(4);
  }

  @Test
  void existingCallWithoutSongCanBeCompletedAfterDefiningItsSong() throws Exception {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    UUID participant = enroll(session, owner, "Ana");
    UUID call = UUID.randomUUID();
    jdbc.sql(
            "INSERT INTO singflow.stage_calls(id,session_id,participant_id,status,created_at)"
                + " VALUES (?,?,?,'CALLED',now())")
        .params(call, session, participant)
        .update();

    var updated = stage.confirm(session, owner, call, participant, null, "Canção", null).active();
    assertThat(updated.id()).isEqualTo(call);
    assertThat(updated.title()).isEqualTo("Canção");
    stage.resolve(session, owner, call, "COMPLETED");
    assertThat(stage.snapshot(session, owner).history()).hasSize(1);
  }

  @Test
  void absenceRoundRecusalAndReactivationPreserveFairness() throws Exception {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    UUID a = enroll(session, owner, "Ana"),
        b = enroll(session, owner, "Bruno"),
        c = enroll(session, owner, "Carla");
    var first = callNext(session, owner);
    stage.resolve(session, owner, first.id(), "ABSENT");
    stage.resolve(session, owner, first.id(), "ABSENT");
    assertThat(stage.snapshot(session, owner).waits().getFirst().remaining()).isEqualTo(2);
    assertThatThrownBy(() -> stage.availability(session, owner, a, "resume"))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    var second = callNext(session, owner);
    assertThat(second.participantId()).isEqualTo(b);
    stage.resolve(session, owner, second.id(), "DECLINED");
    UUID newcomer = enroll(session, owner, "Daniel");
    assertThat(stage.snapshot(session, owner).waits().getFirst().remaining()).isEqualTo(1);
    var third = callNext(session, owner);
    assertThat(third.participantId()).isEqualTo(c);
    stage.resolve(session, owner, third.id(), "COMPLETED");
    assertThat(stage.snapshot(session, owner).waits()).isEmpty();
    var again = callNext(session, owner);
    assertThat(again.participantId()).isEqualTo(a);
    stage.resolve(session, owner, again.id(), "ABSENT");
    var absent =
        participation.list(session, owner).stream()
            .filter(p -> p.id().equals(a))
            .findFirst()
            .orElseThrow();
    assertThat(absent.status()).isEqualTo("INACTIVE");
    assertThat(absent.consecutiveAbsences()).isEqualTo(2);
    assertThat(
            assistedRequests.list(session, owner).stream().filter(r -> r.participantId().equals(a)))
        .allSatisfy(r -> assertThat(r.status()).isEqualTo("SUSPENDED"));
    long previous = absent.checkInOrder();
    stage.availability(session, owner, a, "reactivate");
    var returned =
        participation.list(session, owner).stream()
            .filter(p -> p.id().equals(a))
            .findFirst()
            .orElseThrow();
    assertThat(returned.checkInOrder()).isGreaterThan(previous);
    assertThat(returned.consecutiveAbsences()).isZero();
    assertThat(returned.completedPerformances()).isZero();
    assertThat(stage.snapshot(session, owner).suggestions().getFirst().participantId())
        .isEqualTo(newcomer);
  }

  @Test
  void onlyPersonNeedsManualSecondAttemptAndCancellationHasNoPenalty() throws Exception {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    UUID person = enroll(session, owner, "Só uma pessoa");
    var call = callNext(session, owner);
    stage.resolve(session, owner, call.id(), "CANCELLED");
    assertThat(participation.list(session, owner).getFirst().consecutiveAbsences()).isZero();
    call = callNext(session, owner);
    stage.resolve(session, owner, call.id(), "ABSENT");
    assertThat(stage.snapshot(session, owner).suggestions()).isEmpty();
    assertThat(stage.snapshot(session, owner).waits().getFirst().manualRelease()).isTrue();
    stage.availability(session, owner, person, "resume");
    assertThat(participation.list(session, owner).getFirst().consecutiveAbsences()).isEqualTo(1);
    call = callNext(session, owner);
    stage.resolve(session, owner, call.id(), "COMPLETED");
    assertThat(participation.list(session, owner).getFirst().consecutiveAbsences()).isZero();
    assertThat(participation.list(session, owner).getFirst().completedPerformances()).isEqualTo(1);
  }

  @Test
  void leavingDuringCallCancelsReservationAndReturningDoesNotReviveCancelledRequests()
      throws Exception {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    UUID person = enroll(session, owner, "Ana");
    var call = callNext(session, owner);
    assistedRequests.leave(session, owner, person);
    assertThat(stage.snapshot(session, owner).active()).isNull();
    assertThat(stage.snapshot(session, owner).history().getFirst().status()).isEqualTo("LEFT");
    assertThat(assistedRequests.list(session, owner).getFirst().status()).isEqualTo("CANCELLED");
    stage.availability(session, owner, person, "reactivate");
    assertThat(stage.snapshot(session, owner).suggestions().getFirst().requestId()).isNull();
  }

  @Test
  void concurrentConfirmationsAndCompletionsHaveOneEffect() throws Exception {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    UUID person = enroll(session, owner, "Ana"), operation = UUID.randomUUID();
    try (var executor = Executors.newFixedThreadPool(2)) {
      var a =
          executor.submit(
              () -> stage.confirm(session, owner, operation, person, person, null, null));
      var b =
          executor.submit(
              () -> stage.confirm(session, owner, operation, person, person, null, null));
      assertThat(a.get(15, TimeUnit.SECONDS).active().id()).isEqualTo(operation);
      assertThat(b.get(15, TimeUnit.SECONDS).active().id()).isEqualTo(operation);
      var c = executor.submit(() -> stage.resolve(session, owner, operation, "COMPLETED"));
      var d = executor.submit(() -> stage.resolve(session, owner, operation, "COMPLETED"));
      c.get(15, TimeUnit.SECONDS);
      d.get(15, TimeUnit.SECONDS);
    }
    assertThat(stage.snapshot(session, owner).history()).hasSize(1);
    assertThat(participation.list(session, owner).getFirst().completedPerformances()).isEqualTo(1);
  }

  @Test
  void pauseAndLeavingRemoveBlockersWithoutForgettingTheFirstAbsence() throws Exception {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    UUID a = enroll(session, owner, "Ana"),
        b = enroll(session, owner, "Bruno"),
        c = enroll(session, owner, "Carla");
    var call = callNext(session, owner);
    stage.resolve(session, owner, call.id(), "ABSENT");
    stage.availability(session, owner, b, "pause");
    assistedRequests.leave(session, owner, c);
    assertThat(stage.snapshot(session, owner).waits()).isEmpty();
    assertThat(stage.snapshot(session, owner).suggestions().getFirst().participantId())
        .isEqualTo(a);
    assertThat(
            participation.list(session, owner).stream()
                .filter(p -> p.id().equals(a))
                .findFirst()
                .orElseThrow()
                .consecutiveAbsences())
        .isEqualTo(1);
    stage.availability(session, owner, b, "resume");
    assertThat(
            participation.list(session, owner).stream()
                .filter(p -> p.id().equals(b))
                .findFirst()
                .orElseThrow()
                .checkInOrder())
        .isLessThan(
            participation.list(session, owner).stream()
                .filter(p -> p.id().equals(c))
                .findFirst()
                .orElseThrow()
                .checkInOrder());
  }

  @Autowired br.tec.flowave.singflow.audience.AudienceService audience;

  private jakarta.servlet.http.Cookie prepareGuest(
      UUID session, String code, MockHttpSession browser) throws Exception {
    var result =
        mvc.perform(
                post("/api/participation/" + session + "/prepare")
                    .session(browser)
                    .with(csrf())
                    .contentType("application/json")
                    .content("{\"code\":\"" + code + "\"}"))
            .andExpect(status().isNoContent())
            .andReturn();
    var cookie = result.getResponse().getCookie("SF_PARTICIPANT");
    assertThat(cookie).isNotNull();
    assertThat(cookie.isHttpOnly()).isTrue();
    assertThat(cookie.getPath()).isEqualTo("/api/participation/" + session);
    return cookie;
  }

  private String code(UUID session, String owner) {
    String url = audience.entryLink(session, owner, null).url();
    return url.substring(url.lastIndexOf('/') + 1);
  }

  private void joinGuest(UUID session, String code, jakarta.servlet.http.Cookie cookie)
      throws Exception {
    mvc.perform(
            post("/api/participation/" + session + "/join")
                .cookie(cookie)
                .with(csrf())
                .contentType("application/json")
                .content("{\"code\":\"" + code + "\",\"name\":\"Ana\",\"title\":\"Equalize\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.participant.origin").value("SELF"));
  }

  @Test
  void guestRespondsOnlyToOwnCallAndResumesTheirOwnPause() throws Exception {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    String code = code(session, owner);
    var cookie = prepareGuest(session, code, new MockHttpSession());
    joinGuest(session, code, cookie);
    var other = prepareGuest(session, code, new MockHttpSession());
    joinGuest(session, code, other);
    var initial = audience.me(session, cookie.getValue()).participant();
    var first = callNext(session, owner);
    String calls = "/api/participation/" + session + "/calls/";
    mvc.perform(post(calls + first.id() + "/skip").cookie(other).with(csrf()))
        .andExpect(status().isNotFound());
    mvc.perform(post(calls + first.id() + "/skip").cookie(cookie).with(csrf()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.participant.status").value("PAUSED"))
        .andExpect(jsonPath("$.participant.selfPaused").value(true))
        .andExpect(jsonPath("$.participant.consecutiveAbsences").value(0))
        .andExpect(jsonPath("$.requests[0].status").value("PENDING"));
    var resumed = audience.resume(session, cookie.getValue()).participant();
    assertThat(resumed.checkInOrder()).isEqualTo(initial.checkInOrder());
    assertThat(resumed.status()).isEqualTo("ACTIVE");
    var second = callNext(session, owner);
    mvc.perform(post(calls + second.id() + "/accept").cookie(cookie).with(csrf()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.active.acceptedAt").exists())
        .andExpect(jsonPath("$.participant.completedPerformances").value(0));
    assertThat(stage.snapshot(session, owner).active().acceptedAt()).isNotNull();
    mvc.perform(post(calls + second.id() + "/skip").cookie(cookie).with(csrf()))
        .andExpect(status().isConflict());
    stage.resolve(session, owner, second.id(), "COMPLETED");
    stage.availability(session, owner, initial.id(), "pause");
    mvc.perform(post("/api/participation/" + session + "/resume").cookie(cookie).with(csrf()))
        .andExpect(status().isConflict());
  }

  @Test
  void guestIdentityPrivacyRotationAndIdempotence() throws Exception {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    String code = code(session, owner);
    var browser = new MockHttpSession();
    var cookie = prepareGuest(session, code, browser);
    joinGuest(session, code, cookie);
    joinGuest(session, code, cookie);
    var other = prepareGuest(session, code, new MockHttpSession());
    joinGuest(session, code, other);
    var own = audience.me(session, cookie.getValue());
    var theirs = audience.me(session, other.getValue());
    assertThat(own.participant().id()).isNotEqualTo(theirs.participant().id());
    assertThat(own.requests()).hasSize(1);
    mvc.perform(get("/api/sessions/" + session + "/participants").cookie(cookie))
        .andExpect(status().isUnauthorized());
    mvc.perform(
            post("/api/participation/" + session + "/requests")
                .cookie(cookie)
                .contentType("application/json")
                .content("{}"))
        .andExpect(status().isForbidden());
    mvc.perform(
            post("/api/participation/"
                    + session
                    + "/requests/"
                    + theirs.requests().getFirst().id()
                    + "/cancel")
                .cookie(cookie)
                .with(csrf()))
        .andExpect(status().isNotFound());
    UUID op = UUID.randomUUID();
    audience.add(session, cookie.getValue(), op, "Nova música", null);
    audience.add(session, cookie.getValue(), op, "Nova música", null);
    assertThat(audience.me(session, cookie.getValue()).requests()).hasSize(2);
    audience.cancel(session, cookie.getValue(), op);
    audience.cancel(session, cookie.getValue(), op);
    assertThat(audience.me(session, cookie.getValue()).participant().checkInOrder())
        .isEqualTo(own.participant().checkInOrder());
    var recovered = prepareGuest(session, code, browser);
    assertThat(audience.me(session, recovered.getValue()).participant().id())
        .isEqualTo(own.participant().id());
    UUID rotation = UUID.randomUUID();
    String rotated = audience.entryLink(session, owner, rotation).url();
    assertThat(audience.entryLink(session, owner, rotation).url()).isEqualTo(rotated);
    mvc.perform(get("/api/public/sessions/" + session).param("code", code))
        .andExpect(status().isNotFound());
    mvc.perform(get("/api/participation/" + session + "/me").cookie(recovered))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.requests.length()").value(2));
    assertThat(
            jdbc.sql(
                    "SELECT count(*) FROM singflow.audit_events WHERE session_id=? AND"
                        + " action='SELF_CHECK_IN'")
                .param(session)
                .query(Long.class)
                .single())
        .isEqualTo(2);
  }

  @Test
  void guestLeaveResolvesCallRetainsAccessAndPreservesHistory() throws Exception {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    String code = code(session, owner);
    var cookie = prepareGuest(session, code, new MockHttpSession());
    joinGuest(session, code, cookie);
    var own = audience.me(session, cookie.getValue());
    stage.confirm(
        session,
        owner,
        UUID.randomUUID(),
        own.participant().id(),
        own.requests().getFirst().id(),
        null,
        null);
    mvc.perform(
            post("/api/participation/"
                    + session
                    + "/requests/"
                    + own.requests().getFirst().id()
                    + "/cancel")
                .cookie(cookie)
                .with(csrf()))
        .andExpect(status().isConflict());
    assertThat(audience.me(session, cookie.getValue()).active()).isNotNull();
    mvc.perform(post("/api/participation/" + session + "/leave").cookie(cookie).with(csrf()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.canReturn").value(true))
        .andExpect(header().doesNotExist("Set-Cookie"));
    mvc.perform(get("/api/participation/" + session + "/me").cookie(cookie))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.participant.status").value("LEFT"));
    assertThat(stage.snapshot(session, owner).active()).isNull();
    assertThat(stage.snapshot(session, owner).history().getFirst().status()).isEqualTo("LEFT");
    assertThat(assistedRequests.list(session, owner).getFirst().status()).isEqualTo("CANCELLED");
    assertThat(stage.snapshot(session, owner).suggestions()).isEmpty();
    assertThatThrownBy(
            () -> audience.add(session, cookie.getValue(), UUID.randomUUID(), "Outra", null))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    // A host removal after voluntary departure must revoke access as well.
    assistedRequests.leave(session, owner, own.participant().id());
    stage.availability(session, owner, own.participant().id(), "reactivate");
    mvc.perform(get("/api/participation/" + session + "/me").cookie(cookie))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void guestExpiryAndClosedSession() throws Exception {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    String code = code(session, owner);
    var cookie = prepareGuest(session, code, new MockHttpSession());
    joinGuest(session, code, cookie);
    mvc.perform(
            post("/api/sessions/" + session + "/close")
                .with(user(owner).roles("HOST"))
                .with(csrf()))
        .andExpect(status().isOk());
    mvc.perform(get("/api/participation/" + session + "/me").cookie(cookie))
        .andExpect(status().isOk());
    mvc.perform(
            post("/api/participation/" + session + "/requests")
                .cookie(cookie)
                .with(csrf())
                .contentType("application/json")
                .content("{\"operationId\":\"" + UUID.randomUUID() + "\",\"title\":\"Outra\"}"))
        .andExpect(status().isConflict());
    jdbc.sql(
            "UPDATE singflow.participant_grants SET expires_at=now()-interval '1 second' WHERE"
                + " session_id=?")
        .param(session)
        .update();
    mvc.perform(get("/api/participation/" + session + "/me").cookie(cookie))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void guestRateLimitPersistsRejectedRequestsAndReturnsRetryHeader() throws Exception {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    String code = code(session, owner);
    var cookie = prepareGuest(session, code, new MockHttpSession());
    joinGuest(session, code, cookie);
    for (int n = 0; n < 19; n++)
      mvc.perform(
              post("/api/participation/" + session + "/requests/" + UUID.randomUUID() + "/cancel")
                  .cookie(cookie)
                  .with(csrf()))
          .andExpect(status().isNotFound());
    mvc.perform(
            post("/api/participation/" + session + "/requests/" + UUID.randomUUID() + "/cancel")
                .cookie(cookie)
                .with(csrf()))
        .andExpect(status().isTooManyRequests())
        .andExpect(header().string("Retry-After", "60"));
    mvc.perform(get("/api/participation/" + session + "/me").cookie(cookie))
        .andExpect(status().isOk());
  }

  @Test
  void concurrentGuestCheckInsShareOneParticipant() throws Exception {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    String code = code(session, owner);
    var browser = new MockHttpSession();
    var cookie = prepareGuest(session, code, browser);
    try (var executor = Executors.newFixedThreadPool(2)) {
      var a =
          executor.submit(
              () -> audience.join(session, cookie.getValue(), code, "Ana", null, "Equalize", null));
      var b =
          executor.submit(
              () -> audience.join(session, cookie.getValue(), code, "Ana", null, "Equalize", null));
      assertThat(a.get(10, TimeUnit.SECONDS).participant().id())
          .isEqualTo(b.get(10, TimeUnit.SECONDS).participant().id());
    }
    assertThat(assistedRequests.list(session, owner)).hasSize(1);
  }

  @Test
  void voluntaryReturnPreservesCountsAndHistoryAndDoesNotRenewAccess() throws Exception {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    String code = code(session, owner);
    var cookie = prepareGuest(session, code, new MockHttpSession());
    joinGuest(session, code, cookie);
    var initial = audience.me(session, cookie.getValue());
    var call =
        stage
            .confirm(
                session,
                owner,
                UUID.randomUUID(),
                initial.participant().id(),
                initial.requests().getFirst().id(),
                null,
                null)
            .active();
    stage.resolve(session, owner, call.id(), "COMPLETED");
    var pending = UUID.randomUUID();
    audience.add(session, cookie.getValue(), pending, "Segunda", null);
    audience.leave(session, cookie.getValue());
    audience.leave(session, cookie.getValue());
    var op = UUID.randomUUID();
    var returned = audience.returnToQueue(session, cookie.getValue(), op, "Retorno", "Artista");
    assertThat(returned.participant().id()).isEqualTo(initial.participant().id());
    assertThat(returned.participant().completedPerformances()).isEqualTo(1);
    assertThat(returned.participant().checkInOrder())
        .isGreaterThan(initial.participant().checkInOrder());
    assertThat(returned.expiresAt()).isEqualTo(initial.expiresAt());
    assertThat(returned.requests()).hasSize(3);
    assertThat(
            returned.requests().stream()
                .filter(r -> r.id().equals(pending))
                .findFirst()
                .orElseThrow()
                .status())
        .isEqualTo("CANCELLED");
    assertThat(returned.history()).hasSize(1);
    var retry = audience.returnToQueue(session, cookie.getValue(), op, "Retorno", "Artista");
    assertThat(retry.participant().checkInOrder()).isEqualTo(returned.participant().checkInOrder());
    assertThat(retry.requests()).hasSize(3);
    assertThatThrownBy(
            () -> audience.returnToQueue(session, cookie.getValue(), op, "Alterada", null))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    // A delayed retry of an older operation must never rejoin a later departure.
    audience.leave(session, cookie.getValue());
    assertThat(
            audience
                .returnToQueue(session, cookie.getValue(), op, "Retorno", "Artista")
                .participant()
                .status())
        .isEqualTo("LEFT");
    assertThat(
            jdbc.sql(
                    "SELECT count(*) FROM singflow.audit_events WHERE session_id=? AND"
                        + " action='SELF_RETURNED'")
                .param(session)
                .query(Long.class)
                .single())
        .isEqualTo(1);
  }

  @Test
  void simultaneousReturnsDoNotDuplicateSongOrArrival() throws Exception {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    String code = code(session, owner);
    var cookie = prepareGuest(session, code, new MockHttpSession());
    joinGuest(session, code, cookie);
    audience.leave(session, cookie.getValue());
    UUID op = UUID.randomUUID();
    try (var executor = Executors.newFixedThreadPool(2)) {
      var a =
          executor.submit(
              () -> audience.returnToQueue(session, cookie.getValue(), op, "Retorno", null));
      var b =
          executor.submit(
              () -> audience.returnToQueue(session, cookie.getValue(), op, "Retorno", null));
      var one = a.get(10, TimeUnit.SECONDS);
      var two = b.get(10, TimeUnit.SECONDS);
      assertThat(one.participant().checkInOrder()).isEqualTo(two.participant().checkInOrder());
    }
    assertThat(audience.me(session, cookie.getValue()).requests()).hasSize(2);
    assertThatThrownBy(
            () ->
                audience.returnToQueue(
                    session, cookie.getValue(), UUID.randomUUID(), "Outro retorno", null))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    assertThat(audience.me(session, cookie.getValue()).requests()).hasSize(2);
  }

  @Test
  void returnRequiresSongCsrfOpenSessionAndValidCredential() throws Exception {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    String code = code(session, owner);
    var cookie = prepareGuest(session, code, new MockHttpSession());
    joinGuest(session, code, cookie);
    audience.leave(session, cookie.getValue());
    String body = "{\"operationId\":\"" + UUID.randomUUID() + "\",\"title\":\"Retorno\"}";
    mvc.perform(
            post("/api/participation/" + session + "/return")
                .cookie(cookie)
                .contentType("application/json")
                .content(body))
        .andExpect(status().isForbidden());
    mvc.perform(
            post("/api/participation/" + session + "/return")
                .cookie(cookie)
                .with(csrf())
                .contentType("application/json")
                .content("{\"operationId\":\"" + UUID.randomUUID() + "\",\"title\":\" \"}"))
        .andExpect(status().isBadRequest());
    mvc.perform(
            post("/api/sessions/" + session + "/close")
                .with(user(owner).roles("HOST"))
                .with(csrf()))
        .andExpect(status().isOk());
    mvc.perform(get("/api/participation/" + session + "/me").cookie(cookie))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.canReturn").value(false));
    mvc.perform(
            post("/api/participation/" + session + "/return")
                .cookie(cookie)
                .with(csrf())
                .contentType("application/json")
                .content(body))
        .andExpect(status().isConflict());
    jdbc.sql(
            "UPDATE singflow.participant_grants SET expires_at=now()-interval '1 second' WHERE"
                + " session_id=?")
        .param(session)
        .update();
    mvc.perform(
            post("/api/participation/" + session + "/return")
                .cookie(cookie)
                .with(csrf())
                .contentType("application/json")
                .content(body))
        .andExpect(status().isUnauthorized());
    assertThat(assistedRequests.list(session, owner)).hasSize(1);
  }

  @Test
  void forgettingAccessRevokesCookieButNeverErasesHistoryOrHostLogin() throws Exception {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    String code = code(session, owner);
    var cookie = prepareGuest(session, code, new MockHttpSession());
    joinGuest(session, code, cookie);
    mvc.perform(post("/api/participation/" + session + "/forget").cookie(cookie).with(csrf()))
        .andExpect(status().isConflict());
    audience.leave(session, cookie.getValue());
    mvc.perform(
            post("/api/participation/" + session + "/forget")
                .cookie(cookie)
                .with(user(owner).roles("HOST"))
                .with(csrf()))
        .andExpect(status().isNoContent())
        .andExpect(cookie().maxAge("SF_PARTICIPANT", 0));
    mvc.perform(get("/api/participation/" + session + "/me").cookie(cookie))
        .andExpect(status().isUnauthorized());
    mvc.perform(get("/api/auth/me").with(user(owner).roles("HOST"))).andExpect(status().isOk());
    assertThat(assistedRequests.list(session, owner)).hasSize(1);
  }

  @Test
  void leavingDoesNotBypassHostPauseAndHostRemovalRevokesActiveAccess() throws Exception {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    String code = code(session, owner);
    var cookie = prepareGuest(session, code, new MockHttpSession());
    joinGuest(session, code, cookie);
    var id = audience.me(session, cookie.getValue()).participant().id();
    stage.availability(session, owner, id, "pause");
    var left = audience.leave(session, cookie.getValue());
    assertThat(left.canReturn()).isFalse();
    assertThatThrownBy(
            () ->
                audience.returnToQueue(
                    session, cookie.getValue(), UUID.randomUUID(), "Retorno", null))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    stage.availability(session, owner, id, "reactivate");
    assistedRequests.leave(session, owner, id);
    mvc.perform(get("/api/participation/" + session + "/me").cookie(cookie))
        .andExpect(status().isUnauthorized());
  }

  @Autowired org.springframework.transaction.PlatformTransactionManager transactionManager;
  @Autowired br.tec.flowave.singflow.sessions.SessionAccess sessionAccess;

  @Test
  void waitingReturnObservesCommittedHostRemovalOrSessionClosure() throws Exception {
    for (boolean close : new boolean[] {false, true}) {
      String owner = host();
      UUID session = UUID.randomUUID();
      createOpen(session, owner);
      String code = code(session, owner);
      var cookie = prepareGuest(session, code, new MockHttpSession());
      joinGuest(session, code, cookie);
      var left = audience.leave(session, cookie.getValue());
      long arrival = left.participant().checkInOrder();
      var tx = new org.springframework.transaction.support.TransactionTemplate(transactionManager);
      try (var executor = Executors.newSingleThreadExecutor()) {
        var attempt =
            tx.execute(
                status -> {
                  sessionAccess.lockOwned(session, owner, false);
                  var future =
                      executor.submit(
                          () ->
                              audience.returnToQueue(
                                  session,
                                  cookie.getValue(),
                                  UUID.randomUUID(),
                                  "Retorno concorrente",
                                  null));
                  long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
                  boolean waiting = false;
                  while (System.nanoTime() < deadline) {
                    waiting =
                        jdbc.sql(
                                "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE"
                                    + " cardinality(pg_blocking_pids(pid))>0 AND query LIKE"
                                    + " '%sessions%')")
                            .query(Boolean.class)
                            .single();
                    if (waiting) break;
                    try {
                      Thread.sleep(10);
                    } catch (InterruptedException e) {
                      throw new IllegalStateException(e);
                    }
                  }
                  assertThat(waiting).as("return waits for the locked session").isTrue();
                  if (close) sessionAccess.transition(session, owner, "CLOSED");
                  else assistedRequests.leave(session, owner, left.participant().id());
                  return future;
                });
        assertThatThrownBy(() -> attempt.get(10, TimeUnit.SECONDS))
            .isInstanceOf(ExecutionException.class)
            .hasCauseInstanceOf(org.springframework.web.server.ResponseStatusException.class);
      }
      assertThat(assistedRequests.list(session, owner)).hasSize(1);
      var person = participation.list(session, owner).getFirst();
      assertThat(person.status()).isEqualTo("LEFT");
      assertThat(person.checkInOrder()).isEqualTo(arrival);
    }
  }
}
