package br.tec.flowave.singflow.catalog;

import java.util.Map;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.web.server.ResponseStatusException;

/** One transaction for the complete administrative song draft; no provider searches. */
@Service
public class CatalogDetails {
  private final CatalogService catalog;
  private final CifraResources chords;
  private final StreamingResources streaming;
  public CatalogDetails(CatalogService catalog, CifraResources chords, StreamingResources streaming) {
    this.catalog=catalog;this.chords=chords;this.streaming=streaming;
  }
  public record View(CatalogService.Song song, CifraResources.Link chord,
      List<StreamingResources.Link> streaming) {}

  /** One consistent database snapshot, without provider searches or enrichment. */
  @Transactional(readOnly=true, isolation=Isolation.REPEATABLE_READ)
  public View load(String actor, UUID id) {
    var song=catalog.details(actor,id);
    var chord=chords.admin(actor,id);
    var links=streaming.providers(actor).stream()
        .map(provider->streaming.admin(actor,id,provider.type())).toList();
    return new View(song,chord,links);
  }

  @Transactional
  public CatalogService.Song save(String actor, UUID id, long version, String title,
      String artist, String originalKey, Map<String,String> references) {
    catalog.admin(actor);
    if(references==null || references.size()>16) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
    var types=streaming.providers(actor).stream().map(StreamingSearch.Provider::type).toList();
    for(String type:references.keySet())
      if(!type.equals("cifra")&&!types.contains(type))
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Plataforma indisponível.");
    var song=catalog.editWithKey(actor,id,version,title,artist,originalKey);
    // All adapters join this transaction; a validation/conflict rolls back every change and audit.
    for(var reference:references.entrySet()) {
      if(reference.getKey().equals("cifra"))
        chords.official(actor,id,song.version(),reference.getValue());
      else streaming.save(actor,id,reference.getKey(),song.version(),reference.getValue());
      song=catalog.get(id);
    }
    return song;
  }
}
