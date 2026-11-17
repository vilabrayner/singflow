package br.tec.flowave.singflow.catalog.endpoints;
import br.tec.flowave.singflow.catalog.CatalogEnrichment;
import java.security.Principal;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;
@RestController
class CatalogEnrichmentEndpoints {
  private final CatalogEnrichment enrichment;
  CatalogEnrichmentEndpoints(CatalogEnrichment enrichment){this.enrichment=enrichment;}
  @GetMapping("/api/admin/catalog/songs/{song}/enrichment/{provider}")
  CatalogEnrichment.Prepared prepared(@PathVariable UUID song,@PathVariable String provider,Principal actor){return enrichment.prepared(actor.getName(),song,provider);}
}
