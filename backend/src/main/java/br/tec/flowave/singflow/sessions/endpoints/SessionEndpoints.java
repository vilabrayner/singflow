package br.tec.flowave.singflow.sessions.endpoints;

import br.tec.flowave.singflow.sessions.SessionAccess;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.security.Principal;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/sessions")
class SessionEndpoints {
  record CreateSession(@NotNull UUID operationId, @NotBlank @Size(max = 120) String name) {}

  private final SessionAccess sessions;

  SessionEndpoints(SessionAccess sessions) {
    this.sessions = sessions;
  }

  @GetMapping
  List<SessionAccess.SessionView> list(Principal actor) {
    return sessions.list(actor.getName());
  }

  @PostMapping
  SessionAccess.SessionView create(@Valid @RequestBody CreateSession input, Principal actor) {
    return sessions.create(actor.getName(), input.name(), input.operationId());
  }

  @PostMapping("/{id}/open")
  SessionAccess.SessionView open(@PathVariable UUID id, Principal actor) {
    return sessions.transition(id, actor.getName(), "OPEN");
  }

  @PostMapping("/{id}/close")
  SessionAccess.SessionView close(@PathVariable UUID id, Principal actor) {
    return sessions.transition(id, actor.getName(), "CLOSED");
  }
}
