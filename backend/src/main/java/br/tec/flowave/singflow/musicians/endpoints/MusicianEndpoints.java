package br.tec.flowave.singflow.musicians.endpoints;

import br.tec.flowave.singflow.musicians.MusicianAccess;
import br.tec.flowave.singflow.sessions.SessionAccess;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.security.Principal;
import java.util.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
class MusicianEndpoints {
  record Grant(@NotNull UUID operationId, @NotNull UUID musicianId) {}

  record Member(@NotNull UUID musicianId) {}

  private final MusicianAccess access;

  MusicianEndpoints(MusicianAccess access) {
    this.access = access;
  }

  @GetMapping("/api/sessions/{session}/musicians")
  List<MusicianAccess.Member> members(@PathVariable UUID session, Principal actor) {
    return access.members(session, actor.getName());
  }

  @GetMapping("/api/sessions/{session}/musicians/available")
  List<br.tec.flowave.singflow.identity.AccountAccess.Musician> available(
      @PathVariable UUID session, Principal actor) {
    return access.available(session, actor.getName());
  }

  @PostMapping("/api/sessions/{session}/musicians")
  List<MusicianAccess.Member> grant(
      @PathVariable UUID session, Principal actor, @Valid @RequestBody Grant input) {
    return access.grantById(session, actor.getName(), input.operationId(), input.musicianId());
  }

  @PostMapping("/api/sessions/{session}/musicians/revoke")
  List<MusicianAccess.Member> revoke(
      @PathVariable UUID session, Principal actor, @Valid @RequestBody Member input) {
    return access.revokeById(session, actor.getName(), input.musicianId());
  }

  private boolean host(Authentication actor) {
    return actor.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_HOST"));
  }

  @GetMapping("/api/musicians/sessions")
  List<SessionAccess.SessionView> list(Authentication actor) {
    return access.list(actor.getName(), host(actor));
  }

  @GetMapping("/api/musicians/sessions/{session}")
  MusicianAccess.PerformanceView performance(@PathVariable UUID session, Authentication actor) {
    return access.performance(session, actor.getName(), host(actor));
  }
}
