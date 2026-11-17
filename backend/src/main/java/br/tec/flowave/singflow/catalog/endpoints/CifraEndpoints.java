package br.tec.flowave.singflow.catalog.endpoints;
import br.tec.flowave.singflow.catalog.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.security.Principal;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/admin/catalog/songs/{song}/chords")
class CifraEndpoints {
 record Save(@NotNull @Min(0) Long version,@Size(max=2048) String url) {}
 private final CifraResources chords;private final CifraSearch search;
 CifraEndpoints(CifraResources chords,CifraSearch search){this.chords=chords;this.search=search;}
 @GetMapping CifraResources.Link get(@PathVariable UUID song,Principal actor){return chords.admin(actor.getName(),song);}
 @PostMapping CifraResources.Link save(@PathVariable UUID song,Principal actor,@Valid @RequestBody Save input){return chords.official(actor.getName(),song,input.version(),input.url());}
 @GetMapping("/search") CifraSearch.Page search(@PathVariable UUID song,Principal actor,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="1") int page){chords.admin(actor.getName(),song);return search.search(q,page);}
}
