package br.tec.flowave.singflow.branding;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.security.Principal;
import java.time.Duration;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
@RestController
class BrandingEndpoints {
  record Edit(@NotNull UUID id,@NotBlank @Pattern(regexp="VENUE|PROJECT") String kind,@NotBlank @Size(max=120) String name,UUID logoId,UUID backgroundId,@Size(max=31) String instagram,@Min(0) long version) {}
  private final BrandingRegistry registry;private final BrandingAssets assets;
  BrandingEndpoints(BrandingRegistry registry,BrandingAssets assets){this.registry=registry;this.assets=assets;}
  @GetMapping("/api/admin/branding") List<BrandingRegistry.Entry> all(){return registry.list();}
  @GetMapping("/api/sessions/presentation-options") List<BrandingRegistry.Entry> options(){return registry.list();}
  @PostMapping("/api/admin/branding") BrandingRegistry.Entry save(Principal actor,@Valid @RequestBody Edit input){return registry.save(actor.getName(),input.id(),input.kind(),input.name(),input.logoId(),input.backgroundId(),input.instagram(),input.version());}
  @PostMapping(value="/api/admin/branding/assets",consumes={"image/png","image/jpeg","application/octet-stream"}) BrandingAssets.Asset upload(@RequestBody byte[] input,@RequestParam(defaultValue="false") boolean background){return assets.upload(input,background);}
  @GetMapping("/api/public/branding/assets/{id}") ResponseEntity<byte[]> image(@PathVariable UUID id){var asset=assets.get(id);return ResponseEntity.ok().contentType(MediaType.parseMediaType(asset.type())).cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable()).eTag(asset.digest()).header("X-Content-Type-Options","nosniff").body(asset.bytes());}
}
