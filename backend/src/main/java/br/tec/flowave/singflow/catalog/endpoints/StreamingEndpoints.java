package br.tec.flowave.singflow.catalog.endpoints;

import br.tec.flowave.singflow.catalog.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.security.Principal;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/catalog")
class StreamingEndpoints {
  record Save(@NotNull @Min(0) Long version,@Size(max=2048) String url) {}
  private final StreamingResources streaming;
  StreamingEndpoints(StreamingResources streaming){this.streaming=streaming;}
  @GetMapping("/streaming/providers") List<StreamingSearch.Provider> providers(Principal actor){return streaming.providers(actor.getName());}
  @GetMapping("/songs/{song}/streaming/{type}") StreamingResources.Link get(@PathVariable UUID song,@PathVariable String type,Principal actor){return streaming.admin(actor.getName(),song,type);}
  @PostMapping("/songs/{song}/streaming/{type}") StreamingResources.Link save(@PathVariable UUID song,@PathVariable String type,Principal actor,@Valid @RequestBody Save input){return streaming.save(actor.getName(),song,type,input.version(),input.url());}
  @GetMapping("/songs/{song}/streaming/{type}/search") StreamingSearch.Page search(@PathVariable UUID song,@PathVariable String type,Principal actor,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="1") int page){return streaming.search(actor.getName(),song,type,q,page);}
}
