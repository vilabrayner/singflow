package br.tec.flowave.singflow.catalog.endpoints;

import br.tec.flowave.singflow.catalog.SongSearch;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
class SongSearchEndpoints {
  private final SongSearch search;

  SongSearchEndpoints(SongSearch search) {
    this.search = search;
  }

  @GetMapping("/api/public/songs/search")
  ResponseEntity<List<SongSearch.Song>> search(@RequestParam(defaultValue = "") String q) {
    return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(search.search(q));
  }
}
