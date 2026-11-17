package br.tec.flowave.singflow.catalog;

import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Registry-driven orchestration; a new provider plugs in search and storage adapters. */
@Service
public class StreamingResources {
  public record Link(UUID songId,String type,String label,String icon,String url,long version) {}
  private final CatalogService catalog;
  private final Map<String,StreamingSearch> searches=new LinkedHashMap<>();
  private final Map<String,StreamingReferenceStore> stores=new LinkedHashMap<>();
  public StreamingResources(CatalogService catalog,List<StreamingSearch> searches,List<StreamingReferenceStore> stores){
    this.catalog=catalog;
    searches.forEach(p->{String type=p.provider().type();
      if(!type.matches("[a-z][a-z0-9-]{0,31}") || this.searches.putIfAbsent(type,p)!=null) throw new IllegalStateException("Duplicate or invalid streaming provider");});
    stores.forEach(p->{if(this.stores.putIfAbsent(p.type(),p)!=null) throw new IllegalStateException("Duplicate streaming store");});
    if(!this.searches.keySet().equals(this.stores.keySet())) throw new IllegalStateException("Streaming search and storage adapters must match");
  }
  private StreamingSearch provider(String type) {
    var provider=searches.get(type);
    if(provider==null) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Plataforma indisponível.");
    return provider;
  }
  private Link view(StreamingSearch search,StreamingReferenceStore.State state){
    var p=search.provider();return new Link(state.songId(),p.type(),p.label(),p.icon(),state.url(),state.version());
  }
  @Transactional(readOnly=true)
  public List<StreamingSearch.Provider> providers(String actor){catalog.admin(actor);return searches.values().stream().map(StreamingSearch::provider).sorted(Comparator.comparing(StreamingSearch.Provider::label)).toList();}
  @Transactional(readOnly=true)
  public Link admin(String actor,UUID song,String type){catalog.admin(actor);return view(provider(type),stores.get(type).get(song));}
  /** External I/O runs after the short authorization/catalog read has returned. */
  public StreamingSearch.Page search(String actor,UUID song,String type,String q,int page){
    catalog.admin(actor);provider(type);stores.get(type).get(song);return provider(type).search(q,page);
  }
  @Transactional
  public Link save(String actor,UUID song,String type,long version,String input) {
    catalog.admin(actor);catalog.lock();var provider=provider(type);var store=stores.get(type);
    String url=provider.normalizeUrl(input);var current=store.get(song);
    if(current.version()!=version) {
      if(current.version()==version+1 && Objects.equals(url,current.url()))return view(provider,current);
      throw new ResponseStatusException(HttpStatus.CONFLICT,"A música mudou. Atualize antes de salvar a referência de streaming.");
    }
    if(Objects.equals(url,current.url()))return view(provider,current);
    String before=catalog.snapshot(song);store.update(song,url);
    catalog.audit(song,actor,"STREAMING_LINKED","Referência de "+provider.provider().label()+" definida pelo administrador.",before);
    return view(provider,store.get(song));
  }
  /** Caller must first authorize the actor's access to the session. One query per installed provider. */
  @Transactional(readOnly=true)
  public Map<UUID,List<Link>> session(UUID session) {
    Map<UUID,List<Link>> result=new LinkedHashMap<>();
    stores.forEach((type,store)->store.session(session).forEach(state->result.computeIfAbsent(state.songId(),id->new ArrayList<>()).add(view(provider(type),state))));
    result.replaceAll((id,links)->List.copyOf(links));return result;
  }
}
