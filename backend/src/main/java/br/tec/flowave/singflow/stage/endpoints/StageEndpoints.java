package br.tec.flowave.singflow.stage.endpoints;

import br.tec.flowave.singflow.stage.StageService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.security.Principal;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/sessions/{session}/stage")
class StageEndpoints {
  record Confirm(
      @NotNull UUID operationId,
      @NotNull UUID participantId,
      UUID expectedRequestId,
      @Size(max = 160) String title,
      @Size(max = 160) String artist,
      @Size(max = 36) String selectionToken,
      boolean allowOutOfOrder) {}

  record Skip(@NotNull UUID operationId, @NotNull UUID participantId, UUID expectedRequestId) {}

  @PostMapping("/skip")
  StageService.StageView skip(
      @PathVariable UUID session, @Valid @RequestBody Skip input, Principal actor) {
    return stage.skipNext(
        session,
        actor.getName(),
        input.operationId(),
        input.participantId(),
        input.expectedRequestId());
  }

  record Reorder(
      @NotNull UUID operationId,
      @NotEmpty @Size(max = 500) List<@NotNull UUID> expectedOrder,
      @NotEmpty @Size(max = 500) List<@NotNull UUID> order) {}

  @PostMapping("/reorder")
  StageService.StageView reorder(
      @PathVariable UUID session, @Valid @RequestBody Reorder input, Principal actor) {
    return stage.reorder(
        session, actor.getName(), input.operationId(), input.expectedOrder(), input.order());
  }

  record Resolve(@NotBlank String outcome) {}

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
        input.expectedRequestId(),
        input.title(),
        input.artist(),
        input.selectionToken(),
        input.allowOutOfOrder());
  }

  @PostMapping("/calls/{call}/resolve")
  StageService.StageView resolve(
      @PathVariable UUID session,
      @PathVariable UUID call,
      @Valid @RequestBody Resolve input,
      Principal actor) {
    return stage.resolve(session, actor.getName(), call, input.outcome());
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
