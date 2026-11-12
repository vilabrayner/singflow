package br.tec.flowave.singflow.catalog.endpoints;

import br.tec.flowave.singflow.catalog.CatalogLookup;
import br.tec.flowave.singflow.catalog.CatalogService;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
class SongSearchEndpoints {
  private final CatalogLookup search;

  private final CatalogService catalog;

  SongSearchEndpoints(CatalogLookup search, CatalogService catalog) {
    this.catalog = catalog;
    this.search = search;
  }

  @GetMapping("/api/public/songs/search")
  ResponseEntity<List<CatalogLookup.Match>> search(@RequestParam(defaultValue = "") String q) {
    return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(search.search(q));
  }

  @GetMapping("/api/public/songs/catalog")
  ResponseEntity<CatalogService.PublicPage> browse(@RequestParam(defaultValue = "0") int page) {
    return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(catalog.browse(page));
  }
}
