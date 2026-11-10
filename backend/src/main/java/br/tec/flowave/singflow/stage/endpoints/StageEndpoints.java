package br.tec.flowave.singflow.stage.endpoints;

import br.tec.flowave.singflow.stage.StageService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.security.Principal;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/sessions/{session}/stage")
class StageEndpoints {
  record Confirm(@NotNull UUID operationId, @NotNull UUID participantId, UUID expectedRequestId) {}

  record Resolve(
      @NotBlank String outcome, @Size(max = 160) String title, @Size(max = 160) String artist) {}

  private final StageService stage;

  StageEndpoints(StageService stage) {
    this.stage = stage;
  }

  @GetMapping
  StageService.StageView snapshot(@PathVariable UUID session, Principal actor) {
    return stage.snapshot(session, actor.getName());
  }

  @PostMapping("/calls")
  StageService.StageView confirm(
      @PathVariable UUID session, @Valid @RequestBody Confirm input, Principal actor) {
    return stage.confirm(
        session,
        actor.getName(),
        input.operationId(),
        input.participantId(),
        input.expectedRequestId());
  }

  @PostMapping("/calls/{call}/resolve")
  StageService.StageView resolve(
      @PathVariable UUID session,
      @PathVariable UUID call,
      @Valid @RequestBody Resolve input,
      Principal actor) {
    return stage.resolve(
        session, actor.getName(), call, input.outcome(), input.title(), input.artist());
  }

  @PostMapping("/participants/{participant}/{action}")
  StageService.StageView availability(
      @PathVariable UUID session,
      @PathVariable UUID participant,
      @PathVariable String action,
      Principal actor) {
    return stage.availability(session, actor.getName(), participant, action);
  }
}
