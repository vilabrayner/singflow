package br.tec.flowave.singflow.catalog.endpoints;

import br.tec.flowave.singflow.catalog.CatalogRefinement;
import br.tec.flowave.singflow.catalog.CatalogSync;
import br.tec.flowave.singflow.catalog.SongSearch;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.security.Principal;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/catalog/sync")
class CatalogSyncEndpoints {
  record Start(@NotNull UUID operationId) {}

  record Choice(
      @Min(0) long revision,
      @Min(0) @Max(9) Integer position,
      @Size(max = 160) String title,
      @Size(max = 160) String artist) {
    CatalogSync.Choice value() {
      return new CatalogSync.Choice(revision, position, title, artist);
    }
  }

  record Approve(
      @Min(0) long revision,
      @Min(0) @Max(9) Integer position,
      @Size(max = 160) String title,
      @Size(max = 160) String artist,
      UUID targetId,
      @Min(0) Long targetVersion) {
    CatalogSync.Choice value() {
      return new CatalogSync.Choice(revision, position, title, artist);
    }
  }

  record Refine(
      @Min(0) long revision,
      @NotBlank @Size(max = 160) String title,
      @Size(max = 160) String artist) {}

  record Retry(@Min(0) long revision) {}

  private final CatalogSync sync;
  private final SongSearch search;

  private final CatalogRefinement refinement;

  CatalogSyncEndpoints(CatalogSync sync, SongSearch search, CatalogRefinement refinement) {
    this.refinement = refinement;
    this.sync = sync;
    this.search = search;
  }

  private void configured() {
    if (!search.configured())
      throw new org.springframework.web.server.ResponseStatusException(
          org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
          "Configure LASTFM_API_KEY no backend para consultar o Last.fm.");
  }

  @GetMapping("/runs")
  List<CatalogSync.Run> runs(Principal actor) {
    return sync.runs(actor.getName());
  }

  @PostMapping("/runs")
  CatalogSync.Run start(Principal actor, @Valid @RequestBody Start input) {
    configured();
    return sync.start(actor.getName(), input.operationId());
  }

  @GetMapping("/runs/{id}")
  CatalogSync.Progress progress(Principal actor, @PathVariable UUID id) {
    return sync.progress(actor.getName(), id);
  }

  @GetMapping("/runs/{id}/items")
  CatalogSync.Page items(
      Principal actor,
      @PathVariable UUID id,
      @RequestParam(defaultValue = "activity") String view,
      @RequestParam(defaultValue = "0") int page) {
    return sync.items(actor.getName(), id, view, page);
  }

  @PostMapping("/runs/{id}/{action:pause|resume}")
  CatalogSync.Run control(Principal actor, @PathVariable UUID id, @PathVariable String action) {
    if (action.equals("resume")) configured();
    return sync.control(actor.getName(), id, action);
  }

  @GetMapping("/items/{id}")
  CatalogSync.Detail detail(Principal actor, @PathVariable UUID id) {
    return sync.detail(actor.getName(), id);
  }

  @PostMapping("/items/{id}/search")
  CatalogSync.Detail refine(
      Principal actor, @PathVariable UUID id, @Valid @RequestBody Refine input) {
    configured();
    return refinement.search(actor.getName(), id, input.revision(), input.title(), input.artist());
  }

  @PostMapping("/items/{id}/preview")
  CatalogSync.Preview preview(
      Principal actor, @PathVariable UUID id, @Valid @RequestBody Choice input) {
    return sync.preview(actor.getName(), id, input.value());
  }

  @PostMapping("/items/{id}/approve")
  CatalogSync.Detail approve(
      Principal actor, @PathVariable UUID id, @Valid @RequestBody Approve input) {
    return sync.approve(
        actor.getName(), id, input.value(), input.targetId(), input.targetVersion());
  }

  @PostMapping("/items/{id}/retry")
  CatalogSync.Detail retry(
      Principal actor, @PathVariable UUID id, @Valid @RequestBody Retry input) {
    return sync.retry(actor.getName(), id, input.revision());
  }
}
