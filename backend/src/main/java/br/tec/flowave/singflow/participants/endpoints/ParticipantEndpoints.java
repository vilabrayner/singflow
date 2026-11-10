package br.tec.flowave.singflow.participants.endpoints;

import br.tec.flowave.singflow.participants.Participation;
import java.security.Principal;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/sessions/{session}/participants")
class ParticipantEndpoints {
  private final Participation participation;

  ParticipantEndpoints(Participation participation) {
    this.participation = participation;
  }

  @GetMapping
  List<Participation.ParticipantView> list(@PathVariable UUID session, Principal actor) {
    return participation.list(session, actor.getName());
  }
}
