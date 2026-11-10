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
    assertThat(flyway.info().applied()).hasSize(3);
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
        .confirm(session, owner, UUID.randomUUID(), next.participantId(), next.requestId())
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
    assertThatThrownBy(() -> stage.confirm(session, owner, UUID.randomUUID(), b, b))
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
      stage.resolve(session, owner, current.id(), "COMPLETED", null, null);
      stage.resolve(session, owner, current.id(), "COMPLETED", null, null);
    }
    assertThat(participation.list(session, owner))
        .allSatisfy(p -> assertThat(p.completedPerformances()).isEqualTo(1));
    var repeat = callNext(session, owner);
    assertThat(repeat.participantId()).isEqualTo(a);
    assertThat(repeat.requestId()).isNull();
    assertThatThrownBy(() -> stage.resolve(session, owner, repeat.id(), "COMPLETED", null, null))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    stage.resolve(session, owner, repeat.id(), "COMPLETED", "Escolha no palco", "Artista");
    stage.resolve(session, owner, repeat.id(), "COMPLETED", "Escolha no palco", "Artista");
    assertThat(assistedRequests.list(session, owner)).hasSize(3);
    assertThat(stage.snapshot(session, owner).history()).hasSize(4);
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
    stage.resolve(session, owner, first.id(), "ABSENT", null, null);
    stage.resolve(session, owner, first.id(), "ABSENT", null, null);
    assertThat(stage.snapshot(session, owner).waits().getFirst().remaining()).isEqualTo(2);
    assertThatThrownBy(() -> stage.availability(session, owner, a, "resume"))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    var second = callNext(session, owner);
    assertThat(second.participantId()).isEqualTo(b);
    stage.resolve(session, owner, second.id(), "DECLINED", null, null);
    UUID newcomer = enroll(session, owner, "Daniel");
    assertThat(stage.snapshot(session, owner).waits().getFirst().remaining()).isEqualTo(1);
    var third = callNext(session, owner);
    assertThat(third.participantId()).isEqualTo(c);
    stage.resolve(session, owner, third.id(), "COMPLETED", null, null);
    assertThat(stage.snapshot(session, owner).waits()).isEmpty();
    var again = callNext(session, owner);
    assertThat(again.participantId()).isEqualTo(a);
    stage.resolve(session, owner, again.id(), "ABSENT", null, null);
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
    stage.resolve(session, owner, call.id(), "CANCELLED", null, null);
    assertThat(participation.list(session, owner).getFirst().consecutiveAbsences()).isZero();
    call = callNext(session, owner);
    stage.resolve(session, owner, call.id(), "ABSENT", null, null);
    assertThat(stage.snapshot(session, owner).suggestions()).isEmpty();
    assertThat(stage.snapshot(session, owner).waits().getFirst().manualRelease()).isTrue();
    stage.availability(session, owner, person, "resume");
    assertThat(participation.list(session, owner).getFirst().consecutiveAbsences()).isEqualTo(1);
    call = callNext(session, owner);
    stage.resolve(session, owner, call.id(), "COMPLETED", null, null);
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
      var a = executor.submit(() -> stage.confirm(session, owner, operation, person, person));
      var b = executor.submit(() -> stage.confirm(session, owner, operation, person, person));
      assertThat(a.get(15, TimeUnit.SECONDS).active().id()).isEqualTo(operation);
      assertThat(b.get(15, TimeUnit.SECONDS).active().id()).isEqualTo(operation);
      var c =
          executor.submit(() -> stage.resolve(session, owner, operation, "COMPLETED", null, null));
      var d =
          executor.submit(() -> stage.resolve(session, owner, operation, "COMPLETED", null, null));
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
    stage.resolve(session, owner, call.id(), "ABSENT", null, null);
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
}
