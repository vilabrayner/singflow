package br.tec.flowave.singflow.requests.endpoints;

import br.tec.flowave.singflow.participants.Participation;
import br.tec.flowave.singflow.requests.AssistedRequests;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.security.Principal;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/sessions/{session}")
class AssistedEndpoints {
  record Register(
      @NotNull UUID operationId,
      @NotBlank @Size(max = 120) String name,
      @Size(max = 40) String tableLabel,
      @NotBlank @Size(max = 160) String title,
      @Size(max = 160) String artist) {}

  record Request(
      @NotNull UUID operationId,
      @NotBlank @Size(max = 160) String title,
      @Size(max = 160) String artist) {}

  private final AssistedRequests requests;

  AssistedEndpoints(AssistedRequests requests) {
    this.requests = requests;
  }

  @PostMapping("/participants")
  AssistedRequests.Registration register(
      @PathVariable UUID session, @Valid @RequestBody Register input, Principal actor) {
    return requests.register(
        session,
        actor.getName(),
        input.operationId(),
        input.name(),
        input.tableLabel(),
        input.title(),
        input.artist());
  }

  @GetMapping("/requests")
  List<AssistedRequests.RequestView> list(@PathVariable UUID session, Principal actor) {
    return requests.list(session, actor.getName());
  }

  @PostMapping("/participants/{participant}/requests")
  AssistedRequests.RequestView add(
      @PathVariable UUID session,
      @PathVariable UUID participant,
      @Valid @RequestBody Request input,
      Principal actor) {
    return requests.add(
        session, actor.getName(), participant, input.operationId(), input.title(), input.artist());
  }

  @PostMapping("/participants/{participant}/leave")
  Participation.ParticipantView leave(
      @PathVariable UUID session, @PathVariable UUID participant, Principal actor) {
    return requests.leave(session, actor.getName(), participant);
  }
}
