package br.tec.flowave.singflow.catalog.endpoints;

import br.tec.flowave.singflow.catalog.CatalogService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.security.Principal;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/catalog/songs")
class CatalogEndpoints {
  record Create(
      @NotNull UUID operationId,
      @NotBlank @Size(max = 160) String title,
      @Size(max = 160) String artist) {}

  record Edit(
      @Min(0) long version,
      @NotBlank @Size(max = 160) String title,
      @Size(max = 160) String artist) {}

  record Review(
      @Min(0) long version, @NotBlank String status, @NotNull @Size(max = 500) String reason) {}

  record Merge(
      @Min(0) long version,
      @NotNull UUID targetId,
      @Min(0) long targetVersion,
      @NotBlank @Size(max = 500) String reason) {}

  private final CatalogService catalog;

  CatalogEndpoints(CatalogService catalog) {
    this.catalog = catalog;
  }

  @GetMapping
  CatalogService.Page list(
      Principal actor,
      @RequestParam(defaultValue = "") String q,
      @RequestParam(defaultValue = "") String status,
      @RequestParam(defaultValue = "0") int page) {
    return catalog.list(actor.getName(), q, status, page);
  }

  @PostMapping
  CatalogService.Song create(Principal actor, @Valid @RequestBody Create input) {
    return catalog.create(actor.getName(), input.operationId(), input.title(), input.artist());
  }

  @PostMapping("/{id}")
  CatalogService.Song edit(Principal actor, @PathVariable UUID id, @Valid @RequestBody Edit input) {
    return catalog.edit(actor.getName(), id, input.version(), input.title(), input.artist());
  }

  @PostMapping("/{id}/review")
  CatalogService.Song review(
      Principal actor, @PathVariable UUID id, @Valid @RequestBody Review input) {
    return catalog.review(actor.getName(), id, input.version(), input.status(), input.reason());
  }

  @PostMapping("/{id}/merge")
  CatalogService.Song merge(
      Principal actor, @PathVariable UUID id, @Valid @RequestBody Merge input) {
    return catalog.merge(
        actor.getName(),
        id,
        input.version(),
        input.targetId(),
        input.targetVersion(),
        input.reason());
  }

  @GetMapping("/{id}/history")
  List<CatalogService.Event> history(Principal actor, @PathVariable UUID id) {
    return catalog.history(actor.getName(), id);
  }
}
