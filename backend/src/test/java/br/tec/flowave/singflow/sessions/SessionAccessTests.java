package br.tec.flowave.singflow.sessions;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import br.tec.flowave.singflow.audit.AuditTrail;
import br.tec.flowave.singflow.identity.AccountLifecycle;
import br.tec.flowave.singflow.sessions.infrastructure.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.web.server.ResponseStatusException;

class SessionAccessTests {
  private final SessionRepository repository = mock(SessionRepository.class);
  private final AuditTrail audit = mock(AuditTrail.class);
  private final AccountLifecycle accounts = mock(AccountLifecycle.class);
  private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
  private final SessionAccess access = new SessionAccess(repository, audit, accounts, events);
  private final UUID id = UUID.randomUUID();

  private void account(boolean admin, String status, boolean verified) {
    when(accounts.find("admin"))
        .thenReturn(
            Optional.of(
                new AccountLifecycle.Account(
                    "admin", "Admin", "MUSICIAN", verified, status, admin, Instant.now(), 0)));
  }

  @Test
  void activeAdministratorSeesEverySessionAndOperatesWithOwnIdentity() {
    account(true, "APPROVED", true);
    var session = new KaraokeSession(id, "owner", "Evento");
    session.status = "OPEN";
    when(repository.findAllByOrderByCreatedAtDesc()).thenReturn(List.of(session));
    when(repository.findById(id)).thenReturn(Optional.of(session));
    when(repository.lockById(id)).thenReturn(Optional.of(session));
    assertThat(access.list("admin")).hasSize(1);
    assertThat(access.requireOwned(id, "admin").name()).isEqualTo("Evento");
    access.lockOwned(id, "admin", true);
    assertThat(access.transition(id, "admin", "CLOSED").status()).isEqualTo("CLOSED");
    assertThat(session.owner).isEqualTo("owner");
    verify(audit).record("admin", id, "SESSION_CLOSED", id);
    verify(repository, never()).lockOwned(any(), any());
  }

  @Test
  void ordinaryHostRemainsRestrictedToOwnSessions() {
    account(false, "APPROVED", true);
    when(repository.findByOwnerOrderByCreatedAtDesc("admin")).thenReturn(List.of());
    assertThat(access.list("admin")).isEmpty();
    assertThatThrownBy(() -> access.requireOwned(id, "admin"))
        .isInstanceOf(ResponseStatusException.class);
    assertThatThrownBy(() -> access.lockOwned(id, "admin", false))
        .isInstanceOf(ResponseStatusException.class);
    verify(repository, never()).findById(any());
    verify(repository, never()).lockById(any());
  }

  @Test
  void pendingSuspendedUnverifiedAndRevokedAccountsHaveNoAdministrativeBypass() {
    for (String status : List.of("PENDING", "SUSPENDED", "REJECTED")) {
      account(true, status, true);
      assertThatThrownBy(() -> access.lockOwned(id, "admin", false))
          .isInstanceOf(ResponseStatusException.class);
    }
    account(true, "APPROVED", false);
    assertThatThrownBy(() -> access.lockOwned(id, "admin", false))
        .isInstanceOf(ResponseStatusException.class);
    account(true, "APPROVED", true);
    when(repository.findById(id))
        .thenReturn(Optional.of(new KaraokeSession(id, "owner", "Evento")));
    assertThat(access.requireOwned(id, "admin")).isNotNull();
    account(false, "APPROVED", true);
    assertThatThrownBy(() -> access.requireOwned(id, "admin"))
        .isInstanceOf(ResponseStatusException.class);
    verify(repository, never()).lockById(any());
  }

  @Test
  void administratorStillCannotReopenClosedSessionsOrWriteToNonOpenSessions() {
    account(true, "APPROVED", true);
    var session = new KaraokeSession(id, "owner", "Evento");
    session.status = "CLOSED";
    when(repository.lockById(id)).thenReturn(Optional.of(session));
    assertThatThrownBy(() -> access.lockOwned(id, "admin", true))
        .isInstanceOf(ResponseStatusException.class);
    assertThatThrownBy(() -> access.transition(id, "admin", "OPEN"))
        .isInstanceOf(ResponseStatusException.class);
    verifyNoInteractions(audit);
  }
}
