package br.tec.flowave.singflow.administration.endpoints;

import br.tec.flowave.singflow.administration.SessionOverview;
import java.security.Principal;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/sessions")
class SessionOverviewEndpoints {
  private final SessionOverview overview;

  SessionOverviewEndpoints(SessionOverview overview) {
    this.overview = overview;
  }

  @GetMapping
  List<SessionOverview.Summary> list(Principal actor) {
    return overview.open(actor.getName());
  }

  @GetMapping("/{session}")
  SessionOverview.Detail detail(Principal actor, @PathVariable UUID session) {
    return overview.detail(actor.getName(), session);
  }
}
