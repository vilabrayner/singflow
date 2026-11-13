package br.tec.flowave.singflow;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import br.tec.flowave.singflow.requests.AssistedRequests;
import java.util.List;
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
@SpringBootTest(
    properties = {
      "SINGFLOW_HOST_EMAIL=",
      "SINGFLOW_HOST_PASSWORD=",
      "LASTFM_API_KEY=",
      "SINGFLOW_CATALOG_SYNC_ENABLED=false"
    })
@AutoConfigureMockMvc
class SingflowApplicationTests {
  @Container @ServiceConnection
  static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17.6");

  @org.springframework.test.context.bean.override.mockito.MockitoBean
  br.tec.flowave.singflow.identity.VerificationMail verificationMail;

  @Autowired br.tec.flowave.singflow.identity.AccountLifecycle lifecycle;
  @Autowired MockMvc mvc;
  @Autowired Flyway flyway;

  @Test
  void migratesRealPostgres() {
    assertThat(flyway.info().applied()).hasSize(17);
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

  @Autowired br.tec.flowave.singflow.identity.AccountAccess accounts;
  @Autowired br.tec.flowave.singflow.musicians.MusicianAccess musicianAccess;

  @Test
  void musicianRegistersAndLogsInWithoutReceivingHostPermissions() throws Exception {
    String email = UUID.randomUUID() + "@example.test";
    String body = "{\"email\":\"" + email + "\",\"password\":\"musician-password-2026\"}";
    mvc.perform(
            post("/api/public/musicians/register").contentType("application/json").content(body))
        .andExpect(status().isForbidden());
    mvc.perform(
            post("/api/public/musicians/register")
                .with(csrf())
                .contentType("application/json")
                .content(body))
        .andExpect(status().isNoContent());
    mvc.perform(
            post("/api/public/musicians/register")
                .with(csrf())
                .contentType("application/json")
                .content(body))
        .andExpect(status().isConflict());
    assertThat(
            jdbc.sql("SELECT role FROM singflow.host_accounts WHERE email=?")
                .param(email)
                .query(String.class)
                .single())
        .isEqualTo("MUSICIAN");
    approveFixture(email);
    var login =
        mvc.perform(
                post("/api/auth/login")
                    .with(csrf())
                    .param("email", email)
                    .param("password", "musician-password-2026"))
            .andExpect(status().isNoContent())
            .andReturn();
    var browser = (MockHttpSession) login.getRequest().getSession(false);
    mvc.perform(get("/api/auth/me").session(browser))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.role").value("MUSICIAN"));
    mvc.perform(get("/api/musicians/sessions").session(browser))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(0));
    mvc.perform(get("/api/sessions").session(browser)).andExpect(status().isForbidden());
    mvc.perform(
            post("/api/sessions")
                .session(browser)
                .with(csrf())
                .contentType("application/json")
                .content("{}"))
        .andExpect(status().isForbidden());
  }

  @Test
  void musicianAccessIsSessionScopedReadOnlyAndRevocationSurvivesGrantRetries() throws Exception {
    String owner = host(), other = host();
    String email = UUID.randomUUID() + "@example.test";
    accounts.registerMusician(email, "musician-password-2026");
    approveFixture(email);
    UUID session = UUID.randomUUID(), otherSession = UUID.randomUUID();
    createOpen(session, owner);
    createOpen(otherSession, other);
    enroll(session, owner, "Ana");
    enroll(session, owner, "Bruno");
    UUID operation = UUID.randomUUID();
    String path = "/api/sessions/" + session + "/musicians";
    String body =
        "{\"operationId\":\"" + operation + "\",\"musicianId\":\"" + musicianId(email) + "\"}";
    mvc.perform(
            post(path)
                .with(user(email).roles("MUSICIAN"))
                .with(csrf())
                .contentType("application/json")
                .content(body))
        .andExpect(status().isForbidden());
    mvc.perform(
            post(path)
                .with(user(other).roles("HOST"))
                .with(csrf())
                .contentType("application/json")
                .content(body))
        .andExpect(status().isNotFound());
    mvc.perform(
            post(path)
                .with(user(owner).roles("HOST"))
                .with(csrf())
                .contentType("application/json")
                .content(body))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1));
    try (var executor = Executors.newFixedThreadPool(2)) {
      var first = executor.submit(() -> musicianAccess.grant(session, owner, operation, email));
      var second = executor.submit(() -> musicianAccess.grant(session, owner, operation, email));
      assertThat(first.get(10, TimeUnit.SECONDS)).hasSize(1);
      assertThat(second.get(10, TimeUnit.SECONDS)).hasSize(1);
    }
    mvc.perform(get("/api/musicians/sessions").with(user(email).roles("MUSICIAN")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1));
    String view = "/api/musicians/sessions/" + session;
    mvc.perform(get(view).with(user(email).roles("MUSICIAN")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.stage.suggestions.length()").value(2));
    var called = callNext(session, owner);
    mvc.perform(get(view).with(user(email).roles("MUSICIAN")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.stage.active.participantName").value("Ana"));
    mvc.perform(get("/api/musicians/sessions/" + otherSession).with(user(email).roles("MUSICIAN")))
        .andExpect(status().isNotFound());
    mvc.perform(
            post("/api/sessions/" + session + "/stage/calls/" + called.id() + "/resolve")
                .with(user(email).roles("MUSICIAN"))
                .with(csrf())
                .contentType("application/json")
                .content("{\"outcome\":\"COMPLETED\"}"))
        .andExpect(status().isForbidden());
    stage.resolve(session, owner, called.id(), "COMPLETED");
    mvc.perform(get(view).with(user(email).roles("MUSICIAN")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.stage.history[0].status").value("COMPLETED"));
    mvc.perform(
            post(path + "/revoke")
                .with(user(owner).roles("HOST"))
                .with(csrf())
                .contentType("application/json")
                .content("{\"musicianId\":\"" + musicianId(email) + "\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(0));
    musicianAccess.grant(session, owner, operation, email);
    mvc.perform(get(view).with(user(email).roles("MUSICIAN"))).andExpect(status().isNotFound());
    mvc.perform(get("/api/musicians/sessions").with(user(email).roles("MUSICIAN")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(0));
    assertThat(
            jdbc.sql(
                    "SELECT count(*) FROM singflow.audit_events WHERE session_id=? AND"
                        + " action='MUSICIAN_ACCESS_GRANTED'")
                .param(session)
                .query(Long.class)
                .single())
        .isEqualTo(1);
    assertThat(
            jdbc.sql(
                    "SELECT count(*) FROM singflow.audit_events WHERE session_id=? AND"
                        + " action='MUSICIAN_ACCESS_REVOKED'")
                .param(session)
                .query(Long.class)
                .single())
        .isEqualTo(1);
    assertThat(musicianAccess.grant(session, owner, UUID.randomUUID(), email)).hasSize(1);
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
  void assistedMobileAccessPreservesTheQueueAndRequiresExplicitReplacement() throws Exception {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    UUID ana = enroll(session, owner, "Ana");
    var call = callNext(session, owner);
    long order = participation.list(session, owner).getFirst().checkInOrder();
    var browser = new MockHttpSession();
    String path = "/api/participation/" + session + "/mobile-access";
    String hostPath = "/api/sessions/" + session + "/participants/" + ana + "/mobile-access";
    mvc.perform(post(hostPath).with(csrf())).andExpect(status().isUnauthorized());
    mvc.perform(post(hostPath).with(csrf()).with(user(host()).roles("HOST")))
        .andExpect(status().isNotFound());

    String code =
        java.net.URI.create(audience.issueAccess(session, owner, ana).url()).getFragment();
    String body = "{\"code\":\"" + code + "\"}";
    mvc.perform(
            post(path + "/preview")
                .session(browser)
                .with(csrf())
                .contentType("application/json")
                .content(body))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("Ana"));
    var result =
        mvc.perform(
                post(path + "/claim")
                    .session(browser)
                    .with(csrf())
                    .contentType("application/json")
                    .content(body))
            .andExpect(status().isNoContent())
            .andReturn();
    var cookie = result.getResponse().getCookie("SF_PARTICIPANT");
    assertThat(cookie).isNotNull();
    assertThat(cookie.isHttpOnly()).isTrue();
    assertThat(cookie.getPath()).isEqualTo("/api/participation/" + session);
    var view = audience.me(session, cookie.getValue());
    assertThat(view.participant().id()).isEqualTo(ana);
    assertThat(view.participant().checkInOrder()).isEqualTo(order);
    assertThat(view.participant().origin()).isEqualTo("ASSISTED");
    assertThat(view.requests())
        .singleElement()
        .satisfies(r -> assertThat(r.title()).isEqualTo("Música de Ana"));
    assertThat(view.active().id()).isEqualTo(call.id());
    assertThat(participation.list(session, owner)).hasSize(1);
    var song = audience.add(session, cookie.getValue(), UUID.randomUUID(), "Nova música", null);
    assertThat(song.requests()).hasSize(2);
    mvc.perform(post(path + "/claim").with(csrf()).contentType("application/json").content(body))
        .andExpect(status().isNotFound());

    String expired =
        java.net.URI.create(audience.issueAccess(session, owner, ana).url()).getFragment();
    jdbc.sql(
            "UPDATE singflow.participant_access_invites SET expires_at=now() WHERE session_id=? AND"
                + " participant_id=?")
        .params(session, ana)
        .update();
    mvc.perform(
            post(path + "/preview")
                .with(csrf())
                .contentType("application/json")
                .content("{\"code\":\"" + expired + "\"}"))
        .andExpect(status().isNotFound());
    assertThat(audience.mobileAccess(session, owner, ana).linked()).isTrue();

    String guestCode = code(session, owner);
    var replacementBrowser = new MockHttpSession();
    var guestCookie = prepareGuest(session, guestCode, replacementBrowser);
    joinGuest(session, guestCode, guestCookie);
    UUID guest = audience.me(session, guestCookie.getValue()).participant().id();
    String replacement =
        java.net.URI.create(audience.issueAccess(session, owner, ana).url()).getFragment();
    String replacementBody = "{\"code\":\"" + replacement + "\"}";
    assertThat(audience.mobileAccess(session, owner, ana).pending()).isTrue();
    assertThat(audience.me(session, cookie.getValue()).participant().id()).isEqualTo(ana);
    mvc.perform(
            post(path + "/preview")
                .cookie(guestCookie)
                .session(replacementBrowser)
                .with(csrf())
                .contentType("application/json")
                .content(replacementBody))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.currentId").value(guest.toString()));
    mvc.perform(
            post(path + "/claim")
                .cookie(guestCookie)
                .session(replacementBrowser)
                .with(csrf())
                .contentType("application/json")
                .content(replacementBody))
        .andExpect(status().isConflict());
    var newCookie =
        mvc.perform(
                post(path + "/claim")
                    .cookie(guestCookie)
                    .session(replacementBrowser)
                    .with(csrf())
                    .contentType("application/json")
                    .content(
                        "{\"code\":\""
                            + replacement
                            + "\",\"replaceParticipantId\":\""
                            + guest
                            + "\"}"))
            .andExpect(status().isNoContent())
            .andReturn()
            .getResponse()
            .getCookie("SF_PARTICIPANT");
    String base = "/api/participation/" + session;
    mvc.perform(get(base + "/me").cookie(cookie)).andExpect(status().isUnauthorized());
    mvc.perform(get(base + "/me").cookie(guestCookie)).andExpect(status().isUnauthorized());
    mvc.perform(
            post(base + "/leave")
                .cookie(newCookie)
                .with(csrf())
                .header("X-SingFlow-Participant", guest.toString()))
        .andExpect(status().isConflict());
    assertThat(audience.me(session, newCookie.getValue()).active().id()).isEqualTo(call.id());
    assertThat(participation.list(session, owner)).hasSize(2);
  }

  @Test
  void skipGivesOneOpportunityToTheNextPersonAndPreservesRequests() throws Exception {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    UUID ana = enroll(session, owner, "Ana");
    assertThatThrownBy(() -> stage.skipNext(session, owner, UUID.randomUUID(), ana, ana))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    UUID bruno = enroll(session, owner, "Bruno");
    UUID carla = enroll(session, owner, "Carla");
    UUID operation = UUID.randomUUID();
    String path = "/api/sessions/" + session + "/stage/skip";
    String body =
        "{\"operationId\":\""
            + operation
            + "\",\"participantId\":\""
            + ana
            + "\",\"expectedRequestId\":\""
            + ana
            + "\"}";
    mvc.perform(post(path).with(csrf()).contentType("application/json").content(body))
        .andExpect(status().isUnauthorized());
    mvc.perform(
            post(path)
                .with(user(host()).roles("HOST"))
                .with(csrf())
                .contentType("application/json")
                .content(body))
        .andExpect(status().isNotFound());
    try (var executor = Executors.newFixedThreadPool(2)) {
      var first = executor.submit(() -> stage.skipNext(session, owner, operation, ana, ana));
      var retry = executor.submit(() -> stage.skipNext(session, owner, operation, ana, ana));
      assertThat(first.get(10, TimeUnit.SECONDS).suggestions().getFirst().participantId())
          .isEqualTo(bruno);
      assertThat(retry.get(10, TimeUnit.SECONDS).suggestions().getFirst().participantId())
          .isEqualTo(bruno);
    }
    assertThat(stage.snapshot(session, owner).suggestions())
        .extracting(br.tec.flowave.singflow.stage.StageService.Suggestion::participantId)
        .containsExactly(bruno, ana, carla);
    assertThat(participation.list(session, owner))
        .allSatisfy(
            p -> {
              assertThat(p.status()).isEqualTo("ACTIVE");
              assertThat(p.completedPerformances()).isZero();
              assertThat(p.consecutiveAbsences()).isZero();
            });
    assertThat(assistedRequests.list(session, owner))
        .allSatisfy(r -> assertThat(r.status()).isEqualTo("PENDING"));
    assertThat(stage.snapshot(session, owner).history()).isEmpty();
    assertThatThrownBy(() -> stage.skipNext(session, owner, UUID.randomUUID(), ana, ana))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    var call = callNext(session, owner);
    assertThat(call.participantId()).isEqualTo(bruno);
    stage.resolve(session, owner, call.id(), "COMPLETED");
    assertThat(stage.snapshot(session, owner).suggestions().getFirst().participantId())
        .isEqualTo(ana);
    stage.skipNext(session, owner, operation, ana, ana);
    assertThat(stage.snapshot(session, owner).suggestions().getFirst().participantId())
        .isEqualTo(ana);
    assertThat(
            jdbc.sql(
                    "SELECT count(*) FROM singflow.audit_events WHERE session_id=? AND"
                        + " action='QUEUE_OPPORTUNITY_SKIPPED'")
                .param(session)
                .query(Long.class)
                .single())
        .isEqualTo(1);
  }

  @Test
  void onlyOnePhoneCanConsumeAnIndividualInvitation() throws Exception {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    UUID participant = enroll(session, owner, "Ana");
    String code =
        java.net.URI.create(audience.issueAccess(session, owner, participant).url()).getFragment();
    try (var executor = Executors.newFixedThreadPool(2)) {
      Callable<Boolean> claim =
          () -> {
            try {
              audience.claimAccess(session, code, null, UUID.randomUUID().toString(), null);
              return true;
            } catch (org.springframework.web.server.ResponseStatusException error) {
              assertThat(error.getStatusCode().value()).isEqualTo(404);
              return false;
            }
          };
      var first = executor.submit(claim);
      var second = executor.submit(claim);
      assertThat(
              java.util.List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS)))
          .containsExactlyInAnyOrder(true, false);
    }
    assertThat(
            jdbc.sql(
                    "SELECT count(*) FROM singflow.participant_grants WHERE session_id=? AND"
                        + " participant_id=? AND NOT revoked")
                .params(session, participant)
                .query(Long.class)
                .single())
        .isEqualTo(1);
    String replacement =
        java.net.URI.create(audience.issueAccess(session, owner, participant).url()).getFragment();
    participation.leave(session, owner, participant);
    assertThatThrownBy(() -> audience.claimAccess(session, replacement, null, "late-phone", null))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
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
  void participantAccessFollowsTheOpenSessionAndReportsTheSuggestedPosition() throws Exception {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    String code = code(session, owner);
    var cookie = prepareGuest(session, code, new MockHttpSession());
    assertThat(cookie.getMaxAge()).isGreaterThan(86400);
    joinGuest(session, code, cookie);
    var initial = audience.me(session, cookie.getValue());
    assertThat(initial.expiresAt()).isNull();
    assertThat(initial.queuePosition()).isEqualTo(1);
    UUID next = enroll(session, owner, "Bruno");
    stage.skipNext(
        session,
        owner,
        UUID.randomUUID(),
        initial.participant().id(),
        initial.requests().getFirst().id());
    var moved = audience.me(session, cookie.getValue());
    assertThat(moved.queuePosition()).isEqualTo(2);
    assertThat(moved.suggested()).isFalse();
    var called = callNext(session, owner);
    assertThat(called.participantId()).isEqualTo(next);
    assertThat(audience.me(session, cookie.getValue()).queuePosition()).isEqualTo(1);
    stage.resolve(session, owner, called.id(), "COMPLETED");
    var selfCall = callNext(session, owner);
    assertThat(selfCall.participantId()).isEqualTo(initial.participant().id());
    assertThat(audience.me(session, cookie.getValue()).queuePosition()).isNull();
    // Closing is only allowed after the active performance is resolved.
    stage.resolve(session, owner, selfCall.id(), "COMPLETED");
    mvc.perform(
            post("/api/sessions/" + session + "/close")
                .with(user(owner).roles("HOST"))
                .with(csrf()))
        .andExpect(status().isOk());
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
        .andExpect(status().isUnauthorized());
    mvc.perform(
            post("/api/participation/" + session + "/requests")
                .cookie(cookie)
                .with(csrf())
                .contentType("application/json")
                .content("{\"operationId\":\"" + UUID.randomUUID() + "\",\"title\":\"Outra\"}"))
        .andExpect(status().isUnauthorized());
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
        .andExpect(status().isUnauthorized());
    mvc.perform(
            post("/api/participation/" + session + "/return")
                .cookie(cookie)
                .with(csrf())
                .contentType("application/json")
                .content(body))
        .andExpect(status().isUnauthorized());
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

  private void approveFixture(String email) {
    jdbc.sql(
            "UPDATE singflow.host_accounts SET email_verified=true,status='APPROVED' WHERE email=?")
        .param(email)
        .update();
  }

  private String administrator() {
    String email = host();
    jdbc.sql("UPDATE singflow.host_accounts SET administrator=true WHERE email=?")
        .param(email)
        .update();
    return email;
  }

  private String verificationToken(String email) {
    var token = org.mockito.ArgumentCaptor.forClass(String.class);
    org.mockito.Mockito.verify(verificationMail)
        .send(org.mockito.ArgumentMatchers.eq(email), token.capture());
    return token.getValue();
  }

  private MockHttpSession loginAccount(String email, String password) throws Exception {
    var response =
        mvc.perform(
                post("/api/auth/login")
                    .with(csrf())
                    .param("email", email)
                    .param("password", password))
            .andExpect(status().isNoContent())
            .andReturn();
    return (MockHttpSession) response.getRequest().getSession(false);
  }

  @Test
  void accountRequiresEmailThenApprovalAndSuspensionBlocksAnExistingSession() throws Exception {
    String email = UUID.randomUUID() + "@example.test", admin = administrator();
    mvc.perform(
            post("/api/public/accounts/register")
                .with(csrf())
                .contentType("application/json")
                .content(
                    "{\"name\":\"Novo anfitrião\",\"email\":\""
                        + email
                        + "\",\"password\":\"host-password-2026\",\"role\":\"HOST\"}"))
        .andExpect(status().isNoContent());
    var browser = loginAccount(email, "host-password-2026");
    mvc.perform(get("/api/auth/me").session(browser))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("PENDING"))
        .andExpect(jsonPath("$.emailVerified").value(false));
    mvc.perform(get("/api/sessions").session(browser)).andExpect(status().isForbidden());
    mvc.perform(get("/api/admin/accounts").session(browser)).andExpect(status().isForbidden());
    assertThatThrownBy(() -> lifecycle.decide(admin, email, "APPROVED", "", 0))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    String token = verificationToken(email);
    assertThat(
            jdbc.sql("SELECT token_hash FROM singflow.account_verifications WHERE email=?")
                .param(email)
                .query(String.class)
                .single())
        .isEqualTo(br.tec.flowave.singflow.identity.AccountLifecycle.hash(token))
        .isNotEqualTo(token);
    mvc.perform(
            post("/api/public/accounts/verify")
                .with(csrf())
                .contentType("application/json")
                .content("{\"token\":\"" + token + "\"}"))
        .andExpect(status().isNoContent());
    mvc.perform(
            post("/api/public/accounts/verify")
                .with(csrf())
                .contentType("application/json")
                .content("{\"token\":\"" + token + "\"}"))
        .andExpect(status().isBadRequest());
    mvc.perform(get("/api/sessions").session(browser)).andExpect(status().isForbidden());
    long version = lifecycle.get(email).version();
    mvc.perform(
            post("/api/admin/accounts/decision")
                .with(user(admin).roles("HOST", "ADMIN"))
                .with(csrf())
                .contentType("application/json")
                .content(
                    "{\"email\":\""
                        + email
                        + "\",\"status\":\"APPROVED\",\"reason\":\"Cadastro revisado\",\"version\":"
                        + version
                        + "}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("APPROVED"));
    mvc.perform(get("/api/sessions").session(browser)).andExpect(status().isOk());
    assertThatThrownBy(() -> lifecycle.decide(admin, email, "SUSPENDED", "Motivo", version))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    lifecycle.decide(admin, email, "SUSPENDED", "Acesso revisado", version + 1);
    mvc.perform(get("/api/sessions").session(browser)).andExpect(status().isForbidden());
    mvc.perform(get("/api/auth/me").session(browser))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("SUSPENDED"));
    assertThat(lifecycle.history(email))
        .extracting(e -> e.action())
        .contains("REGISTERED", "EMAIL_VERIFIED", "APPROVED", "SUSPENDED");
  }

  @Test
  void adminCannotBeSpoofedOrBlockItselfAndRoleFiltersAreEnforced() throws Exception {
    String owner = host(), admin = administrator();
    mvc.perform(get("/api/admin/accounts")).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/admin/accounts").with(user(owner).roles("HOST", "ADMIN")))
        .andExpect(status().isForbidden());
    var browser = loginAccount(admin, "test-password-2026");
    mvc.perform(get("/api/admin/accounts").param("role", "MUSICIAN").session(browser))
        .andExpect(status().isOk());
    mvc.perform(
            post("/api/admin/accounts/decision")
                .session(browser)
                .contentType("application/json")
                .content("{}"))
        .andExpect(status().isForbidden());
    assertThatThrownBy(
            () ->
                lifecycle.decide(
                    admin, admin, "SUSPENDED", "Teste", lifecycle.get(admin).version()))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    jdbc.sql("UPDATE singflow.host_accounts SET administrator=false WHERE email=?")
        .param(admin)
        .update();
    mvc.perform(get("/api/admin/accounts").session(browser)).andExpect(status().isForbidden());
    mvc.perform(get("/api/sessions").session(browser)).andExpect(status().isOk());
  }

  @Test
  void expiredVerificationAndUnverifiedMusicianCannotBypassApproval() throws Exception {
    String email = UUID.randomUUID() + "@example.test";
    accounts.registerMusician(email, "musician-password-2026");
    String token = verificationToken(email);
    jdbc.sql(
            "UPDATE singflow.account_verifications SET expires_at=now()-interval '1 second' WHERE"
                + " email=?")
        .param(email)
        .update();
    mvc.perform(
            post("/api/public/accounts/verify")
                .with(csrf())
                .contentType("application/json")
                .content("{\"token\":\"" + token + "\"}"))
        .andExpect(status().isBadRequest());
    assertThatThrownBy(() -> accounts.requireMusician(email))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    var browser = loginAccount(email, "musician-password-2026");
    mvc.perform(get("/api/musicians/sessions").session(browser)).andExpect(status().isForbidden());
    assertThat(lifecycle.get(email).emailVerified()).isFalse();
  }

  @Test
  void competingAdminDecisionsUseAccountVersion() throws Exception {
    String email = host(), admin = administrator();
    jdbc.sql("UPDATE singflow.host_accounts SET status='PENDING' WHERE email=?")
        .param(email)
        .update();
    long version = lifecycle.get(email).version();
    try (var pool = Executors.newFixedThreadPool(2)) {
      Callable<Boolean> decision =
          () -> {
            try {
              lifecycle.decide(admin, email, "APPROVED", "", version);
              return true;
            } catch (org.springframework.web.server.ResponseStatusException e) {
              assertThat(e.getStatusCode().value()).isEqualTo(409);
              return false;
            }
          };
      var a = pool.submit(decision);
      var b = pool.submit(decision);
      assertThat(java.util.List.of(a.get(10, TimeUnit.SECONDS), b.get(10, TimeUnit.SECONDS)))
          .containsExactlyInAnyOrder(true, false);
    }
    assertThat(lifecycle.history(email)).filteredOn(e -> e.action().equals("APPROVED")).hasSize(1);
  }

  private UUID musicianId(String email) {
    return jdbc.sql("SELECT account_id FROM singflow.host_accounts WHERE email=?")
        .param(email)
        .query(UUID.class)
        .single();
  }

  @Test
  void hostChoosesApprovedMusiciansByNameWithoutReceivingTheirEmails() throws Exception {
    String owner = host(), other = host();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    String musician = UUID.randomUUID() + "@example.test",
        pending = UUID.randomUUID() + "@example.test";
    accounts.registerMusician(musician, "musician-password-2026");
    approveFixture(musician);
    jdbc.sql("UPDATE singflow.host_accounts SET display_name='Músico Aprovado' WHERE email=?")
        .param(musician)
        .update();
    accounts.registerMusician(pending, "musician-password-2026");
    String path = "/api/sessions/" + session + "/musicians";
    var response =
        mvc.perform(get(path + "/available").with(user(owner).roles("HOST")))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertThat(response)
        .contains("Músico Aprovado", musicianId(musician).toString())
        .doesNotContain(musician, pending, musicianId(pending).toString());
    mvc.perform(get(path + "/available").with(user(other).roles("HOST")))
        .andExpect(status().isNotFound());
    mvc.perform(get(path + "/available").with(user(musician).roles("MUSICIAN")))
        .andExpect(status().isForbidden());
    mvc.perform(
            post(path)
                .with(user(owner).roles("HOST"))
                .with(csrf())
                .contentType("application/json")
                .content(
                    "{\"operationId\":\""
                        + UUID.randomUUID()
                        + "\",\"musicianId\":\""
                        + musicianId(pending)
                        + "\"}"))
        .andExpect(status().isNotFound());
    var granted =
        mvc.perform(
                post(path)
                    .with(user(owner).roles("HOST"))
                    .with(csrf())
                    .contentType("application/json")
                    .content(
                        "{\"operationId\":\""
                            + UUID.randomUUID()
                            + "\",\"musicianId\":\""
                            + musicianId(musician)
                            + "\"}"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertThat(granted).contains("Músico Aprovado").doesNotContain(musician, "email");
    jdbc.sql("UPDATE singflow.host_accounts SET status='SUSPENDED' WHERE email=?")
        .param(musician)
        .update();
    mvc.perform(
            post(path)
                .with(user(owner).roles("HOST"))
                .with(csrf())
                .contentType("application/json")
                .content(
                    "{\"operationId\":\""
                        + UUID.randomUUID()
                        + "\",\"musicianId\":\""
                        + musicianId(musician)
                        + "\"}"))
        .andExpect(status().isNotFound());
    mvc.perform(
            post(path + "/revoke")
                .with(user(owner).roles("HOST"))
                .with(csrf())
                .contentType("application/json")
                .content("{\"musicianId\":\"" + musicianId(musician) + "\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(0));
  }

  @Test
  void administratorCanReadAndOperateOtherHostsSessionWithOwnAuditIdentity() throws Exception {
    String owner = host(), admin = administrator();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    UUID draft = UUID.randomUUID();
    mvc.perform(
            post("/api/sessions")
                .with(user(owner).roles("HOST"))
                .with(csrf())
                .contentType("application/json")
                .content(
                    "{\"operationId\":\"" + draft + "\",\"name\":\"Rascunho administrativo\"}"))
        .andExpect(status().isOk());
    String musician = UUID.randomUUID() + "@example.test";
    accounts.registerMusician(musician, "musician-password-2026");
    approveFixture(musician);
    musicianAccess.grantById(session, owner, UUID.randomUUID(), musicianId(musician));
    enroll(session, owner, "Ana");
    enroll(session, owner, "Bruno");
    var call = callNext(session, owner);
    String path = "/api/admin/sessions/" + session;
    mvc.perform(get(path)).andExpect(status().isUnauthorized());
    mvc.perform(get(path).with(user(owner).roles("HOST"))).andExpect(status().isForbidden());
    mvc.perform(get(path).with(user(musician).roles("MUSICIAN"))).andExpect(status().isForbidden());
    mvc.perform(get(path).with(user(admin).roles("HOST", "ADMIN")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.host.email").value(owner))
        .andExpect(jsonPath("$.musicians[0].id").value(musicianId(musician).toString()))
        .andExpect(jsonPath("$.stage.active.participantName").value("Ana"))
        .andExpect(jsonPath("$.stage.suggestions[0].name").value("Bruno"));
    String list =
        mvc.perform(get("/api/admin/sessions").with(user(admin).roles("HOST", "ADMIN")))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertThat(list).contains(session.toString()).doesNotContain(draft.toString());
    mvc.perform(
            post("/api/sessions/" + session + "/stage/calls/" + call.id() + "/resolve")
                .with(user(admin).roles("HOST", "ADMIN"))
                .with(csrf())
                .contentType("application/json")
                .content("{\"outcome\":\"COMPLETED\"}"))
        .andExpect(status().isOk());
    assertThat(
            jdbc.sql(
                    "SELECT actor FROM singflow.audit_events WHERE session_id=? AND"
                        + " action='CALL_COMPLETED'")
                .param(session)
                .query(String.class)
                .single())
        .isEqualTo(admin);
    assertThat(
            jdbc.sql("SELECT owner FROM singflow.sessions WHERE id=?")
                .param(session)
                .query(String.class)
                .single())
        .isEqualTo(owner);
    mvc.perform(
            post("/api/sessions/" + session + "/close")
                .with(user(admin).roles("HOST", "ADMIN"))
                .with(csrf()))
        .andExpect(status().isOk());
    assertThat(
            jdbc.sql(
                    "SELECT actor FROM singflow.audit_events WHERE session_id=? AND"
                        + " action='SESSION_CLOSED'")
                .param(session)
                .query(String.class)
                .single())
        .isEqualTo(admin);
    mvc.perform(get(path).with(user(admin).roles("HOST", "ADMIN")))
        .andExpect(status().isConflict());
  }

  @Test
  void administratorWithMusicianProfileCanManageAnySessionAndRevocationTakesEffect()
      throws Exception {
    String owner = host(), outsider = host(), admin = administrator();
    jdbc.sql("UPDATE singflow.host_accounts SET role='MUSICIAN' WHERE email=?")
        .param(admin)
        .update();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    mvc.perform(get("/api/sessions").with(user(admin).roles("MUSICIAN", "ADMIN")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[?(@.id == '" + session + "')]").isNotEmpty());
    String base = "/api/sessions/" + session;
    for (String suffix :
        new String[] {
          "/participants", "/requests", "/stage", "/musicians", "/musicians/available"
        }) {
      mvc.perform(get(base + suffix).with(user(admin).roles("MUSICIAN", "ADMIN")))
          .andExpect(status().isOk());
      mvc.perform(get(base + suffix).with(user(outsider).roles("HOST", "ADMIN")))
          .andExpect(status().isNotFound());
    }
    UUID operation = UUID.randomUUID();
    mvc.perform(
            post(base + "/participants")
                .with(user(admin).roles("MUSICIAN", "ADMIN"))
                .with(csrf())
                .contentType("application/json")
                .content(
                    "{\"operationId\":\""
                        + operation
                        + "\",\"name\":\"Ana\",\"title\":\"Equalize\"}"))
        .andExpect(status().isOk());
    assertThat(
            jdbc.sql(
                    "SELECT actor FROM singflow.audit_events WHERE session_id=? AND"
                        + " action='ASSISTED_CHECK_IN'")
                .param(session)
                .query(String.class)
                .single())
        .isEqualTo(admin);
    jdbc.sql("UPDATE singflow.host_accounts SET administrator=false WHERE email=?")
        .param(admin)
        .update();
    mvc.perform(get(base + "/stage").with(user(admin).roles("MUSICIAN", "ADMIN")))
        .andExpect(status().isForbidden());
    mvc.perform(post(base + "/close").with(user(admin).roles("MUSICIAN", "ADMIN")).with(csrf()))
        .andExpect(status().isForbidden());
    jdbc.sql("UPDATE singflow.host_accounts SET role='HOST' WHERE email=?").param(admin).update();
    mvc.perform(get(base + "/stage").with(user(admin).roles("HOST", "ADMIN")))
        .andExpect(status().isNotFound());
    mvc.perform(get(base + "/stage").with(user(owner).roles("HOST"))).andExpect(status().isOk());
  }

  @Autowired br.tec.flowave.singflow.catalog.CatalogService catalog;

  @Test
  void catalogLinksProvisionalRequestsAndPreservesHistoryAcrossEditsAndMerges() throws Exception {
    String owner = host(), admin = administrator(), title = "Catálogo " + UUID.randomUUID();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    var registration =
        assistedRequests.register(session, owner, UUID.randomUUID(), "Ana", null, title, "Artista");
    UUID source = registration.request().catalogSongId();
    assertThat(source).isNotNull();
    var repeated =
        assistedRequests.add(
            session,
            owner,
            registration.participant().id(),
            UUID.randomUUID(),
            title.toUpperCase(java.util.Locale.ROOT),
            "  artista  ");
    assertThat(repeated.catalogSongId()).isEqualTo(source);
    assertThat(catalog.list(admin, title, "PENDING", 0).items())
        .extracting(br.tec.flowave.singflow.catalog.CatalogService.Song::id)
        .contains(source);
    assertThat(catalog.approved(title)).isEmpty();
    // Provisional catalog entries do not block queue eligibility or completed performances.
    var call = callNext(session, owner);
    stage.resolve(session, owner, call.id(), "COMPLETED");
    assertThat(
            jdbc.sql("SELECT catalog_song_id FROM singflow.stage_calls WHERE id=?")
                .param(call.id())
                .query(UUID.class)
                .single())
        .isEqualTo(source);
    var approved = catalog.review(admin, source, 0, "APPROVED", "");
    assertThat(catalog.approved(title))
        .extracting(br.tec.flowave.singflow.catalog.CatalogService.Song::id)
        .contains(source);
    var edited = catalog.edit(admin, source, approved.version(), title + " corrigido", "Artista");
    assertThat(catalog.approved(title))
        .extracting(br.tec.flowave.singflow.catalog.CatalogService.Song::id)
        .contains(source);
    var destination = catalog.create(admin, UUID.randomUUID(), title + " oficial", "Artista");
    catalog.merge(
        admin,
        source,
        edited.version(),
        destination.id(),
        destination.version(),
        "Mesmo cadastro musical");
    assertThat(
            jdbc.sql(
                    "SELECT singflow.catalog_root(catalog_song_id) FROM singflow.song_requests"
                        + " WHERE id=?")
                .param(registration.request().id())
                .query(UUID.class)
                .single())
        .isEqualTo(destination.id());
    assertThat(
            assistedRequests.list(session, owner).stream()
                .filter(q -> q.id().equals(registration.request().id()))
                .findFirst()
                .orElseThrow()
                .title())
        .isEqualTo(title);
    assertThat(stage.snapshot(session, owner).history().getFirst().title()).isEqualTo(title);
    var later =
        assistedRequests.add(
            session, owner, registration.participant().id(), UUID.randomUUID(), title, "Artista");
    assertThat(later.catalogSongId()).isEqualTo(destination.id());
    assertThat(catalog.history(admin, source))
        .extracting(br.tec.flowave.singflow.catalog.CatalogService.Event::action)
        .contains("CREATED", "APPROVED", "EDITED", "MERGED");
    assertThat(catalog.history(admin, source).getFirst().actor()).isEqualTo(admin);
  }

  @Test
  void catalogAdminEndpointsEnforceRolesVersionsAndMergeRules() throws Exception {
    String owner = host(), admin = administrator(), title = "Revisão " + UUID.randomUUID();
    var song = catalog.create(admin, UUID.randomUUID(), title, "Artista");
    String path = "/api/admin/catalog/songs/" + song.id();
    mvc.perform(get("/api/admin/catalog/songs")).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/admin/catalog/songs").with(user(owner).roles("HOST", "ADMIN")))
        .andExpect(status().isForbidden());
    mvc.perform(
            post(path + "/review")
                .with(user(admin).roles("HOST", "ADMIN"))
                .contentType("application/json")
                .content("{}"))
        .andExpect(status().isForbidden());
    mvc.perform(
            post(path + "/review")
                .with(user(admin).roles("HOST", "ADMIN"))
                .with(csrf())
                .contentType("application/json")
                .content(
                    "{\"version\":0,\"status\":\"REJECTED\",\"reason\":\"Cadastro incorreto\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("REJECTED"));
    mvc.perform(
            post(path)
                .with(user(admin).roles("HOST", "ADMIN"))
                .with(csrf())
                .contentType("application/json")
                .content("{\"version\":0,\"title\":\"Outro título\",\"artist\":\"Artista\"}"))
        .andExpect(status().isConflict());
    assertThat(catalog.approved(title)).isEmpty();
    assertThatThrownBy(() -> catalog.merge(admin, song.id(), 1, song.id(), 1, "Mesmo cadastro"))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    jdbc.sql("UPDATE singflow.host_accounts SET administrator=false WHERE email=?")
        .param(admin)
        .update();
    mvc.perform(get(path + "/history").with(user(admin).roles("HOST", "ADMIN")))
        .andExpect(status().isForbidden());
  }

  @Test
  void catalogConcurrentRequestsShareOneEntryAndConflictingReviewsAreDetected() throws Exception {
    String owner = host(), admin = administrator(), title = "Concorrência " + UUID.randomUUID();
    UUID a = UUID.randomUUID(), b = UUID.randomUUID();
    createOpen(a, owner);
    createOpen(b, owner);
    try (var pool = Executors.newFixedThreadPool(2)) {
      var first =
          pool.submit(
              () ->
                  assistedRequests
                      .register(a, owner, UUID.randomUUID(), "Ana", null, title, "Artista")
                      .request()
                      .catalogSongId());
      var second =
          pool.submit(
              () ->
                  assistedRequests
                      .register(b, owner, UUID.randomUUID(), "Bruno", null, title, "Artista")
                      .request()
                      .catalogSongId());
      UUID id = first.get(10, TimeUnit.SECONDS);
      assertThat(second.get(10, TimeUnit.SECONDS)).isEqualTo(id);
      java.util.concurrent.Callable<Boolean> decide =
          () -> {
            try {
              catalog.review(admin, id, 0, "APPROVED", "");
              return true;
            } catch (org.springframework.web.server.ResponseStatusException e) {
              assertThat(e.getStatusCode().value()).isEqualTo(409);
              return false;
            }
          };
      var one = pool.submit(decide);
      var two = pool.submit(decide);
      assertThat(java.util.List.of(one.get(10, TimeUnit.SECONDS), two.get(10, TimeUnit.SECONDS)))
          .containsExactlyInAnyOrder(true, false);
      assertThat(catalog.history(admin, id))
          .filteredOn(e -> e.action().equals("APPROVED"))
          .hasSize(1);
    }
  }

  @Test
  void catalogMigrationBackfillsLegacyRequestsAndStageWithoutRewritingSnapshots() throws Exception {
    String database = "catalog_upgrade_" + UUID.randomUUID().toString().replace("-", "");
    String url = postgres.getJdbcUrl().replace("/" + postgres.getDatabaseName(), "/" + database);
    try (var connection =
            java.sql.DriverManager.getConnection(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        var statement = connection.createStatement()) {
      statement.execute("CREATE DATABASE " + database);
    }
    try {
      Flyway.configure()
          .dataSource(url, postgres.getUsername(), postgres.getPassword())
          .target("13")
          .load()
          .migrate();
      UUID session = UUID.randomUUID(),
          participant = UUID.randomUUID(),
          request = UUID.randomUUID(),
          call = UUID.randomUUID();
      try (var connection =
              java.sql.DriverManager.getConnection(
                  url, postgres.getUsername(), postgres.getPassword());
          var statement = connection.createStatement()) {
        statement.execute(
            "INSERT INTO singflow.host_accounts(email,password_hash)"
                + " VALUES('legacy@example.test','unused')");
        statement.execute(
            "INSERT INTO singflow.sessions(id,owner,name,status,created_at) VALUES('"
                + session
                + "','legacy@example.test','Legado','OPEN',now())");
        statement.execute(
            "INSERT INTO"
                + " singflow.participants(id,session_id,name,status,origin,checked_in_at,queue_joined_at)"
                + " VALUES('"
                + participant
                + "','"
                + session
                + "','Ana','ACTIVE','ASSISTED',now(),now())");
        statement.execute(
            "INSERT INTO"
                + " singflow.song_requests(id,session_id,participant_id,title,artist,status,created_at)"
                + " VALUES('"
                + request
                + "','"
                + session
                + "','"
                + participant
                + "','Equalize','Pitty','PENDING',now())");
        statement.execute(
            "INSERT INTO"
                + " singflow.stage_calls(id,session_id,participant_id,title,artist,status,created_at)"
                + " VALUES('"
                + call
                + "','"
                + session
                + "','"
                + participant
                + "','  EQUALIZE  ','pitty','CALLED',now())");
      }
      var upgraded =
          Flyway.configure().dataSource(url, postgres.getUsername(), postgres.getPassword()).load();
      upgraded.migrate();
      assertThat(upgraded.validateWithResult().validationSuccessful).isTrue();
      try (var connection =
              java.sql.DriverManager.getConnection(
                  url, postgres.getUsername(), postgres.getPassword());
          var statement = connection.createStatement()) {
        try (var result =
            statement.executeQuery(
                "SELECT r.title,r.artist,c.title,c.artist,r.catalog_song_id=c.catalog_song_id FROM"
                    + " singflow.song_requests r CROSS JOIN singflow.stage_calls c")) {
          assertThat(result.next()).isTrue();
          assertThat(result.getString(1)).isEqualTo("Equalize");
          assertThat(result.getString(2)).isEqualTo("Pitty");
          assertThat(result.getString(3)).isEqualTo("  EQUALIZE  ");
          assertThat(result.getString(4)).isEqualTo("pitty");
          assertThat(result.getBoolean(5)).isTrue();
        }
        try (var result =
            statement.executeQuery(
                "SELECT count(*) FROM singflow.catalog_songs WHERE status='PENDING' AND"
                    + " source='LEGACY'")) {
          result.next();
          assertThat(result.getInt(1)).isEqualTo(1);
        }
      }
    } finally {
      try (var connection =
              java.sql.DriverManager.getConnection(
                  postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
          var statement = connection.createStatement()) {
        statement.execute("DROP DATABASE " + database + " WITH (FORCE)");
      }
    }
  }

  @Autowired br.tec.flowave.singflow.catalog.LastfmChoices lastfmChoices;

  @Test
  void lastfmSelectionIsVerifiedAndFreeTextRemainsProvisional() {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpenUnchecked(session, owner);
    String title = "Lastfm " + UUID.randomUUID();
    String token =
        lastfmChoices.issue(
            new br.tec.flowave.singflow.catalog.SongSearch.Song(
                title, "Artista", "https://www.last.fm/music/A/_/B", ""));
    var chosen =
        assistedRequests.register(
            session, owner, UUID.randomUUID(), "Ana", null, title, "Artista", token);
    assertThat(
            jdbc.sql("SELECT status FROM singflow.catalog_songs WHERE id=?")
                .param(chosen.request().catalogSongId())
                .query(String.class)
                .single())
        .isEqualTo("APPROVED");
    var free =
        assistedRequests.add(
            session,
            owner,
            chosen.participant().id(),
            UUID.randomUUID(),
            "Livre " + UUID.randomUUID(),
            null);
    assertThat(
            jdbc.sql("SELECT status FROM singflow.catalog_songs WHERE id=?")
                .param(free.catalogSongId())
                .query(String.class)
                .single())
        .isEqualTo("PENDING");
    UUID operation = UUID.randomUUID();
    assertThatThrownBy(
            () ->
                assistedRequests.add(
                    session,
                    owner,
                    chosen.participant().id(),
                    operation,
                    title + " adulterado",
                    "Artista",
                    token))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    assertThat(
            jdbc.sql("SELECT count(*) FROM singflow.song_requests WHERE id=?")
                .param(operation)
                .query(Long.class)
                .single())
        .isZero();
    jdbc.sql(
            "UPDATE singflow.lastfm_choices SET expires_at=now()-interval '1 second' WHERE"
                + " id=cast(? AS uuid)")
        .param(token)
        .update();
    assertThatThrownBy(
            () ->
                assistedRequests.add(
                    session,
                    owner,
                    chosen.participant().id(),
                    UUID.randomUUID(),
                    title,
                    "Artista",
                    token))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    // A replay of the already committed operation remains idempotent even after proof expiry.
    assertThat(
            assistedRequests
                .register(
                    session, owner, chosen.request().id(), "Ana", null, title, "Artista", token)
                .request()
                .id())
        .isEqualTo(chosen.request().id());
  }

  private void createOpenUnchecked(UUID session, String owner) {
    try {
      createOpen(session, owner);
    } catch (Exception error) {
      throw new RuntimeException(error);
    }
  }

  @Test
  void personalOrderChangesNextSongWithoutChangingArrivalOrCompletedCount() {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpenUnchecked(session, owner);
    var person =
        assistedRequests.register(session, owner, UUID.randomUUID(), "Ana", null, "Música A", null);
    var second =
        assistedRequests.add(
            session, owner, person.participant().id(), UUID.randomUUID(), "Música B", null);
    UUID operation = UUID.randomUUID();
    var expected = java.util.List.of(person.request().id(), second.id());
    var desired = java.util.List.of(second.id(), person.request().id());
    assistedRequests.reorder(
        session, owner, person.participant().id(), operation, expected, desired);
    assistedRequests.reorder(
        session, owner, person.participant().id(), operation, expected, desired);
    assertThat(stage.snapshot(session, owner).suggestions().getFirst().title())
        .isEqualTo("Música B");
    var current = participation.list(session, owner).getFirst();
    assertThat(current.checkedInAt()).isEqualTo(person.participant().checkedInAt());
    assertThat(current.completedPerformances()).isZero();
    assertThat(
            jdbc.sql(
                    "SELECT count(*) FROM singflow.audit_events WHERE target_id=? AND"
                        + " action='REQUESTS_REORDERED'")
                .param(operation)
                .query(Long.class)
                .single())
        .isEqualTo(1);
    var call = callNext(session, owner);
    assertThatThrownBy(
            () ->
                assistedRequests.reorder(
                    session,
                    owner,
                    person.participant().id(),
                    UUID.randomUUID(),
                    desired,
                    expected))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    assertThat(stage.snapshot(session, owner).active().id()).isEqualTo(call.id());
    assertThat(stage.snapshot(session, owner).active().title()).isEqualTo("Música B");
  }

  @Test
  void concurrentPersonalReordersHaveOneWinnerAndCannotIncludeOtherParticipants() throws Exception {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpen(session, owner);
    var a = assistedRequests.register(session, owner, UUID.randomUUID(), "Ana", null, "A", null);
    var b =
        assistedRequests.add(session, owner, a.participant().id(), UUID.randomUUID(), "B", null);
    var other =
        assistedRequests.register(session, owner, UUID.randomUUID(), "Bruno", null, "Outra", null);
    var expected = java.util.List.of(a.request().id(), b.id());
    var desired = java.util.List.of(b.id(), a.request().id());
    assertThatThrownBy(
            () ->
                assistedRequests.reorder(
                    session,
                    owner,
                    a.participant().id(),
                    UUID.randomUUID(),
                    java.util.List.of(a.request().id(), other.request().id()),
                    java.util.List.of(other.request().id(), a.request().id())))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    try (var pool = Executors.newFixedThreadPool(2)) {
      Callable<Boolean> action =
          () -> {
            try {
              assistedRequests.reorder(
                  session, owner, a.participant().id(), UUID.randomUUID(), expected, desired);
              return true;
            } catch (org.springframework.web.server.ResponseStatusException e) {
              assertThat(e.getStatusCode().value()).isEqualTo(409);
              return false;
            }
          };
      var first = pool.submit(action);
      var second = pool.submit(action);
      assertThat(
              java.util.List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS)))
          .containsExactlyInAnyOrder(true, false);
    }
  }

  @Test
  void participantEditsPendingSongWithoutChangingOrderAndCannotEditReservedOrForeignRequest() {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpenUnchecked(session, owner);
    var person =
        assistedRequests.register(session, owner, UUID.randomUUID(), "Ana", null, "Música A", null);
    var other =
        assistedRequests.register(session, owner, UUID.randomUUID(), "Bruno", null, "Outra", null);
    var second =
        assistedRequests.add(
            session, owner, person.participant().id(), UUID.randomUUID(), "Música B", null);
    UUID id = person.request().id();
    long position =
        jdbc.sql("SELECT request_order FROM singflow.song_requests WHERE id=?")
            .param(id)
            .query(Long.class)
            .single();
    assistedRequests.editSelf(
        session,
        owner,
        person.participant().id(),
        id,
        "Música A",
        null,
        "Nova música",
        "Artista",
        null);
    assistedRequests.editSelf(
        session,
        owner,
        person.participant().id(),
        id,
        "Música A",
        null,
        "Nova música",
        "Artista",
        null);
    assertThat(
            jdbc.sql("SELECT request_order FROM singflow.song_requests WHERE id=?")
                .param(id)
                .query(Long.class)
                .single())
        .isEqualTo(position);
    assertThat(stage.snapshot(session, owner).suggestions().getFirst().title())
        .isEqualTo("Nova música");
    assertThat(participation.list(session, owner).getFirst().checkedInAt())
        .isEqualTo(person.participant().checkedInAt());
    assertThat(
            jdbc.sql(
                    "SELECT count(*) FROM singflow.audit_events WHERE target_id=? AND"
                        + " action='SELF_REQUEST_EDITED'")
                .param(id)
                .query(Long.class)
                .single())
        .isEqualTo(1);
    assertThatThrownBy(
            () ->
                assistedRequests.editSelf(
                    session,
                    owner,
                    person.participant().id(),
                    id,
                    "Música A",
                    null,
                    "Edição obsoleta",
                    null,
                    null))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    assertThatThrownBy(
            () ->
                assistedRequests.editSelf(
                    session,
                    owner,
                    person.participant().id(),
                    other.request().id(),
                    "Outra",
                    null,
                    "Inválida",
                    null,
                    null))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    var call = callNext(session, owner);
    assertThatThrownBy(
            () ->
                assistedRequests.editSelf(
                    session,
                    owner,
                    person.participant().id(),
                    id,
                    "Nova música",
                    "Artista",
                    "Depois de convocar",
                    null,
                    null))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    assertThat(stage.snapshot(session, owner).active().title()).isEqualTo("Nova música");
  }

  @Test
  void hostManualOrderPersistsUntilEachOpportunityAndAppendsNewArrivals() {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpenUnchecked(session, owner);
    var a = assistedRequests.register(session, owner, UUID.randomUUID(), "Ana", null, "A", null);
    var b = assistedRequests.register(session, owner, UUID.randomUUID(), "Bruno", null, "B", null);
    var c = assistedRequests.register(session, owner, UUID.randomUUID(), "Carla", null, "C", null);
    var expected =
        stage.snapshot(session, owner).suggestions().stream().map(v -> v.participantId()).toList();
    var order = List.of(c.participant().id(), a.participant().id(), b.participant().id());
    UUID operation = UUID.randomUUID();
    stage.reorder(session, owner, operation, expected, order);
    stage.reorder(session, owner, operation, expected, order);
    assertThat(
            stage.snapshot(session, owner).suggestions().stream()
                .map(v -> v.participantId())
                .toList())
        .isEqualTo(order);
    var d = assistedRequests.register(session, owner, UUID.randomUUID(), "Dora", null, "D", null);
    assertThat(
            stage.snapshot(session, owner).suggestions().stream()
                .map(v -> v.participantId())
                .toList())
        .containsExactly(
            c.participant().id(), a.participant().id(), b.participant().id(), d.participant().id());
    for (var id : order) {
      var next = stage.snapshot(session, owner).suggestions().getFirst();
      assertThat(next.participantId()).isEqualTo(id);
      var call =
          stage
              .confirm(session, owner, UUID.randomUUID(), id, next.requestId(), null, null)
              .active();
      stage.resolve(session, owner, call.id(), "COMPLETED");
    }
    assertThat(stage.snapshot(session, owner).suggestions().getFirst().participantId())
        .isEqualTo(d.participant().id());
    assertThat(
            jdbc.sql("SELECT count(*) FROM singflow.stage_manual_order WHERE session_id=?")
                .param(session)
                .query(Long.class)
                .single())
        .isZero();
    assertThat(participation.list(session, owner).getFirst().checkedInAt())
        .isEqualTo(a.participant().checkedInAt());
    assertThat(
            jdbc.sql(
                    "SELECT count(*) FROM singflow.audit_events WHERE target_id=? AND"
                        + " action='QUEUE_MANUALLY_REORDERED'")
                .param(operation)
                .query(Long.class)
                .single())
        .isEqualTo(1);
  }

  @Test
  void hostCanExplicitlyCallOutOfOrderAndPauseResumeWithoutLosingRequests() {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpenUnchecked(session, owner);
    var a = assistedRequests.register(session, owner, UUID.randomUUID(), "Ana", null, "A", null);
    var b = assistedRequests.register(session, owner, UUID.randomUUID(), "Bruno", null, "B", null);
    assertThatThrownBy(
            () ->
                stage.confirm(
                    session,
                    owner,
                    UUID.randomUUID(),
                    b.participant().id(),
                    b.request().id(),
                    null,
                    null))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    UUID operation = UUID.randomUUID();
    var called =
        stage.confirm(
            session,
            owner,
            operation,
            b.participant().id(),
            b.request().id(),
            null,
            null,
            null,
            true);
    assertThat(called.active().participantId()).isEqualTo(b.participant().id());
    stage.confirm(
        session, owner, operation, b.participant().id(), b.request().id(), null, null, null, true);
    assertThatThrownBy(
            () ->
                stage.confirm(
                    session,
                    owner,
                    UUID.randomUUID(),
                    a.participant().id(),
                    a.request().id(),
                    null,
                    null,
                    null,
                    true))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    stage.resolve(session, owner, operation, "CANCELLED");
    var paused = stage.availability(session, owner, b.participant().id(), "pause");
    assertThat(paused.paused().stream().map(v -> v.participantId()).toList())
        .containsExactly(b.participant().id());
    assertThat(paused.suggestions().stream().map(v -> v.participantId()).toList())
        .doesNotContain(b.participant().id());
    assertThatThrownBy(
            () ->
                stage.confirm(
                    session,
                    owner,
                    UUID.randomUUID(),
                    b.participant().id(),
                    b.request().id(),
                    null,
                    null,
                    null,
                    true))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    stage.availability(session, owner, b.participant().id(), "resume");
    assertThat(stage.snapshot(session, owner).paused()).isEmpty();
    assertThat(
            assistedRequests.list(session, owner).stream()
                .filter(v -> v.participantId().equals(b.participant().id()))
                .findFirst()
                .orElseThrow()
                .status())
        .isEqualTo("PENDING");
    assertThat(
            participation.list(session, owner).stream()
                .filter(v -> v.id().equals(b.participant().id()))
                .findFirst()
                .orElseThrow()
                .completedPerformances())
        .isZero();
    assertThat(
            jdbc.sql(
                    "SELECT count(*) FROM singflow.audit_events WHERE target_id=? AND"
                        + " action='CALL_PRIORITY_OVERRIDDEN'")
                .param(operation)
                .query(Long.class)
                .single())
        .isEqualTo(1);
    mvcQueueAuthorization(session, owner);
  }

  private void mvcQueueAuthorization(UUID session, String owner) {
    try {
      mvc.perform(
              post("/api/sessions/" + session + "/stage/reorder")
                  .with(user(host()).roles("HOST"))
                  .with(csrf())
                  .contentType("application/json")
                  .content(
                      "{\"operationId\":\""
                          + UUID.randomUUID()
                          + "\",\"expectedOrder\":[\""
                          + UUID.randomUUID()
                          + "\"],\"order\":[\""
                          + UUID.randomUUID()
                          + "\"]}"))
          .andExpect(status().isNotFound());
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }

  @Test
  void concurrentHostReordersHaveOneWinnerAndRejectCalledOrForeignParticipants() throws Exception {
    String owner = host();
    UUID session = UUID.randomUUID();
    createOpenUnchecked(session, owner);
    var a = assistedRequests.register(session, owner, UUID.randomUUID(), "Ana", null, "A", null);
    var b = assistedRequests.register(session, owner, UUID.randomUUID(), "Bruno", null, "B", null);
    var expected = List.of(a.participant().id(), b.participant().id());
    var order = List.of(b.participant().id(), a.participant().id());
    assertThatThrownBy(
            () ->
                stage.reorder(
                    session,
                    owner,
                    UUID.randomUUID(),
                    expected,
                    List.of(b.participant().id(), UUID.randomUUID())))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    try (var pool = Executors.newFixedThreadPool(2)) {
      Callable<Boolean> action =
          () -> {
            try {
              stage.reorder(session, owner, UUID.randomUUID(), expected, order);
              return true;
            } catch (org.springframework.web.server.ResponseStatusException e) {
              assertThat(e.getStatusCode().value()).isEqualTo(409);
              return false;
            }
          };
      var one = pool.submit(action);
      var two = pool.submit(action);
      assertThat(List.of(one.get(10, TimeUnit.SECONDS), two.get(10, TimeUnit.SECONDS)))
          .containsExactlyInAnyOrder(true, false);
    }
    stage.confirm(
        session, owner, UUID.randomUUID(), b.participant().id(), b.request().id(), null, null);
    assertThatThrownBy(() -> stage.reorder(session, owner, UUID.randomUUID(), order, expected))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
  }

  @Test
  void malformedStageCallReturnsBadRequestAndCsrfStillProtectsMutations() throws Exception {
    var owner = host();
    String path = "/api/sessions/" + UUID.randomUUID() + "/stage/calls";
    mvc.perform(
            post(path)
                .with(user(owner).roles("HOST"))
                .with(csrf())
                .contentType("application/json")
                .content("{\"operationId\":\"not-a-uuid\"}"))
        .andExpect(status().isBadRequest())
        .andExpect(
            jsonPath("$.detail")
                .value(
                    "Não foi possível ler os dados enviados. Confira os campos e tente"
                        + " novamente."));
    mvc.perform(
            post(path)
                .with(user(owner).roles("HOST"))
                .contentType("application/json")
                .content("{}"))
        .andExpect(status().isForbidden());
  }
}
