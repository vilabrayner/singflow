package br.tec.flowave.singflow.catalog.endpoints;

import br.tec.flowave.singflow.catalog.CatalogService;
import br.tec.flowave.singflow.catalog.CatalogDetails;
import br.tec.flowave.singflow.catalog.CatalogLookup;
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
      @Size(max = 160) String artist, @Size(max=4) String originalKey) {}

  record Edit(
      @Min(0) long version,
      @NotBlank @Size(max = 160) String title,
      @Size(max = 160) String artist, @Size(max=4) String originalKey) {}

  record OriginalKey(@Min(0) long version,@Size(max=4) String originalKey) {}
  @PostMapping("/{id}/key")
  CatalogService.Song key(Principal actor,@PathVariable UUID id,@Valid @RequestBody OriginalKey input) {
    return catalog.setOriginalKey(actor.getName(),id,input.version(),input.originalKey());
  }

  record Review(
      @Min(0) long version, @NotBlank String status, @NotNull @Size(max = 500) String reason) {}

  record Merge(
      @Min(0) long version,
      @NotNull UUID targetId,
      @Min(0) long targetVersion,
      @NotBlank @Size(max = 500) String reason) {}

  record Delete(@Min(0) long version) {}
  record ImportChoice(@NotNull UUID operationId, @NotBlank @Size(max=160) String title,
      @NotBlank @Size(max=160) String artist, @NotBlank @Size(max=36) String selectionToken) {}
  private final CatalogLookup lookup;
  private final CatalogService catalog;
  private final CatalogDetails details;

  CatalogEndpoints(CatalogService catalog, CatalogLookup lookup, CatalogDetails details) {
    this.lookup = lookup;
    this.details = details;
    this.catalog = catalog;
  }

  @GetMapping
  CatalogService.Page list(
      Principal actor,
      @RequestParam(defaultValue = "") String q,
      @RequestParam(defaultValue = "") String status,
      @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "25") int size) {
    return catalog.list(actor.getName(), q, status, page, size);
  }

  @PostMapping
  CatalogService.Song create(Principal actor, @Valid @RequestBody Create input) {
    return catalog.createWithKey(actor.getName(), input.operationId(), input.title(), input.artist(),input.originalKey());
  }

  @PostMapping("/{id}")
  CatalogService.Song edit(Principal actor, @PathVariable UUID id, @Valid @RequestBody Edit input) {
    return catalog.editWithKey(actor.getName(), id, input.version(), input.title(), input.artist(),input.originalKey());
  }

  record Details(@Min(0) long version, @NotBlank @Size(max=160) String title,
      @Size(max=160) String artist, @Size(max=4) String originalKey,
      @NotNull @Size(max=16) Map<@NotBlank String,@Size(max=2048) String> references) {}

  @GetMapping("/{id}/details")
  CatalogDetails.View editor(Principal actor,@PathVariable UUID id) {
    return details.load(actor.getName(),id);
  }

  @PostMapping("/{id}/details")
  CatalogService.Song details(Principal actor,@PathVariable UUID id,@Valid @RequestBody Details input) {
    return details.save(actor.getName(),id,input.version(),input.title(),input.artist(),input.originalKey(),input.references());
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

  @GetMapping("/search-page")
  CatalogLookup.AdminPage search(Principal actor, @RequestParam(defaultValue="") String q,
      @RequestParam(defaultValue="") String status, @RequestParam(defaultValue="catalog") String source,
      @RequestParam(defaultValue="0") int page) {
    return lookup.adminSearch(actor.getName(), q, status, source, page);
  }
  @GetMapping("/{id}")
  CatalogService.Song details(Principal actor, @PathVariable UUID id) { return catalog.details(actor.getName(), id); }
  @PostMapping("/{id}/delete")
  void delete(Principal actor, @PathVariable UUID id, @Valid @RequestBody Delete input) { catalog.delete(actor.getName(), id, input.version()); }
  @PostMapping("/from-internet")
  CatalogService.Song importChoice(Principal actor, @Valid @RequestBody ImportChoice input) {
    return catalog.importChoice(actor.getName(),input.operationId(),input.title(),input.artist(),input.selectionToken());
  }

}
