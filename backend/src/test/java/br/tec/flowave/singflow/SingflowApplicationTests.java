package br.tec.flowave.singflow;

import static org.assertj.core.api.Assertions.assertThat;
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
    assertThat(flyway.info().applied()).hasSize(2);
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
}
