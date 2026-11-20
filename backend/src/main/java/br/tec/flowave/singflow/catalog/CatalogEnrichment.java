package br.tec.flowave.singflow.catalog;

import java.time.Instant;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CatalogEnrichment {
  public record Candidate(String type,String id,String title,String artist,String album,int durationMs,String url,boolean recommended) {}
  public record Prepared(String type,String state,String message,List<Candidate> candidates) {}
  public record Claim(UUID songId,String provider,String title,String artist,int attempts,UUID token) {}
  private record Job(String title,String artist,String state,String message,UUID token,int attempts) {}
  private final JdbcClient jdbc;
  private final CatalogService catalog;
  private final boolean enabled;
  private final Map<String,StreamingReferenceStore> stores=new HashMap<>();
  private final Map<String,StreamingSearch> searches=new HashMap<>();
  private final Set<String> providers=new LinkedHashSet<>(List.of("lyrics","cifra"));
  public CatalogEnrichment(JdbcClient jdbc,CatalogService catalog,List<StreamingSearch> streaming,List<StreamingReferenceStore> stores,
      @Value("${SINGFLOW_ENRICHMENT_ENABLED:true}") boolean enabled){
    this.jdbc=jdbc;this.catalog=catalog;this.enabled=enabled;stores.forEach(store->this.stores.put(store.type(),store));streaming.forEach(p->{providers.add(p.provider().type());searches.put(p.provider().type(),p);});
  }
  @EventListener
  @Transactional(propagation=Propagation.MANDATORY)
  public void requested(SongEnrichmentRequested event){
    if(!enabled)return;
    catalog.lock();var song=catalog.get(event.songId());
    for(String provider:providers)jdbc.sql("INSERT INTO singflow.catalog_enrichment_jobs(song_id,provider,title,artist,state) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING")
      .params(song.id(),provider,song.title(),song.artist(),song.artist().isBlank()?"WAITING_METADATA":"QUEUED").update();
  }
  private Optional<Job> job(UUID song,String provider){
    return jdbc.sql("SELECT * FROM singflow.catalog_enrichment_jobs WHERE song_id=? AND provider=?").params(song,provider)
      .query((rs,n)->new Job(rs.getString("title"),rs.getString("artist"),rs.getString("state"),rs.getString("message"),rs.getObject("claim_token",UUID.class),rs.getInt("attempts"))).optional();
  }
  private boolean usable(CatalogService.Song song){
    return !Set.of("REJECTED","MERGED").contains(song.status())&&!jdbc.sql("SELECT deleted_at IS NOT NULL FROM singflow.catalog_songs WHERE id=?").param(song.id()).query(Boolean.class).single();
  }
  private boolean linked(UUID song,String provider){
    if(provider.equals("cifra"))return jdbc.sql("SELECT nullif(trim(chords_url),'') IS NOT NULL FROM singflow.catalog_songs WHERE id=?").param(song).query(Boolean.class).single();
    var store=stores.get(provider);if(store==null)return false;String url=store.get(song).url();return url!=null&&!url.isBlank();
  }
  private void clear(UUID song,String provider){jdbc.sql("DELETE FROM singflow.catalog_enrichment_candidates WHERE song_id=? AND provider=?").params(song,provider).update();}
  private void state(UUID song,String provider,String state,String message){
    jdbc.sql("UPDATE singflow.catalog_enrichment_jobs SET state=?,message=?,claim_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE song_id=? AND provider=?").params(state,message,song,provider).update();
  }
  @Transactional
  public Optional<Claim> claim(){
    if(!enabled)return Optional.empty();catalog.lock();
    var selected=jdbc.sql("""
      SELECT j.song_id,j.provider FROM singflow.catalog_enrichment_jobs j
      JOIN singflow.catalog_songs s ON s.id=j.song_id
      WHERE s.deleted_at IS NULL AND (
        (j.state='QUEUED' AND j.next_attempt_at<=clock_timestamp()) OR
        (j.state='PROCESSING' AND j.lease_until<clock_timestamp()) OR
        (j.state='WAITING_METADATA' AND s.artist<>'') OR
        j.title<>s.title OR j.artist<>s.artist)
      ORDER BY j.next_attempt_at,CASE j.provider WHEN 'lyrics' THEN 0 WHEN 'cifra' THEN 1 ELSE 2 END,j.song_id,j.provider
      LIMIT 1 FOR UPDATE OF j SKIP LOCKED
      """).query((rs,n)->Map.entry(rs.getObject(1,UUID.class),rs.getString(2))).optional();
    if(selected.isEmpty())return Optional.empty();var key=selected.get();var song=catalog.get(key.getKey());var job=job(song.id(),key.getValue()).orElseThrow();String provider=key.getValue();
    boolean changed=!song.title().equals(job.title())||!song.artist().equals(job.artist());
    if(changed){clear(song.id(),provider);jdbc.sql("UPDATE singflow.catalog_enrichment_jobs SET title=?,artist=?,attempts=0 WHERE song_id=? AND provider=?").params(song.title(),song.artist(),song.id(),provider).update();}
    if(!usable(song)||linked(song.id(),provider)){clear(song.id(),provider);state(song.id(),provider,"SKIPPED","Referência existente ou música indisponível.");return Optional.empty();}
    if(song.artist().isBlank()){state(song.id(),provider,"WAITING_METADATA","Informe o artista para preparar os recursos.");return Optional.empty();}
    UUID token=UUID.randomUUID();int attempt=changed?1:job.attempts()+1;
    jdbc.sql("UPDATE singflow.catalog_enrichment_jobs SET state='PROCESSING',attempts=?,claim_token=?,lease_until=clock_timestamp()+interval '2 minutes',message='',updated_at=clock_timestamp() WHERE song_id=? AND provider=?")
      .params(attempt,token,song.id(),provider).update();
    return Optional.of(new Claim(song.id(),provider,song.title(),song.artist(),attempt,token));
  }
  private boolean current(Claim claim){
    var job=job(claim.songId(),claim.provider());
    if(job.isEmpty()||!"PROCESSING".equals(job.get().state())||!claim.token().equals(job.get().token()))return false;
    var song=catalog.get(claim.songId());
    if(!song.title().equals(claim.title())||!song.artist().equals(claim.artist())){
      clear(song.id(),claim.provider());jdbc.sql("UPDATE singflow.catalog_enrichment_jobs SET title=?,artist=?,state=?,attempts=0,claim_token=NULL,lease_until=NULL,next_attempt_at=clock_timestamp(),message='',updated_at=clock_timestamp() WHERE song_id=? AND provider=?")
        .params(song.title(),song.artist(),song.artist().isBlank()?"WAITING_METADATA":"QUEUED",song.id(),claim.provider()).update();return false;
    }
    if(!usable(song)||linked(song.id(),claim.provider())){clear(song.id(),claim.provider());state(song.id(),claim.provider(),"SKIPPED","Referência existente ou música indisponível.");return false;}
    return true;
  }
  @Transactional
  public void complete(Claim claim,List<Candidate> candidates){
    catalog.lock();if(!current(claim))return;clear(claim.songId(),claim.provider());
    var unique=new LinkedHashMap<String,Candidate>();
    for(var candidate:candidates)if(candidate.type().equals(claim.provider())&&candidate.url()!=null&&candidate.url().length()<=2048)unique.putIfAbsent(candidate.url(),candidate);
    int position=0;
    for(var c:unique.values()){
      if(position==10)break;
      jdbc.sql("INSERT INTO singflow.catalog_enrichment_candidates(song_id,provider,position,external_id,title,artist,album,duration_ms,url,recommended) VALUES(?,?,?,?,?,?,?,?,?,?)")
        .params(claim.songId(),claim.provider(),position++,limit(c.id(),160),limit(c.title(),512),limit(c.artist(),1024),limit(c.album(),512),Math.max(0,c.durationMs()),c.url(),c.recommended()).update();
    }
    if(position>0 && !claim.provider().equals("lyrics")) {
      // Provider order is preserved; never issue another external lookup here.
      var first=unique.values().iterator().next();
      String url=claim.provider().equals("cifra")?CifraSearch.safeUrl(first.url()):searches.get(claim.provider()).normalizeUrl(first.url());
      if(url!=null) {
        String before=catalog.snapshot(claim.songId());
        if(claim.provider().equals("cifra")) jdbc.sql("UPDATE singflow.catalog_songs SET chords_url=?,version=version+1,updated_at=clock_timestamp() WHERE id=?").params(url,claim.songId()).update();
        else stores.get(claim.provider()).update(claim.songId(),url);
        catalog.audit(claim.songId(),"system:enrichment","RESOURCE_AUTO_LINKED","Primeiro resultado de "+claim.provider()+" vinculado automaticamente.",before);
      }
    }
    state(claim.songId(),claim.provider(),claim.provider().equals("lyrics")||linked(claim.songId(),claim.provider())?"COMPLETED":position==0?"NOT_FOUND":"READY","");
  }
  /** Promote already fetched suggestions without spending another provider request. */
  @Transactional
  public boolean applyPrepared() {
    if(!enabled)return false;
    catalog.lock();
    var next=jdbc.sql("SELECT j.song_id,j.provider FROM singflow.catalog_enrichment_jobs j JOIN singflow.catalog_songs s ON s.id=j.song_id WHERE j.state='READY' AND s.deleted_at IS NULL AND j.title=s.title AND j.artist=s.artist ORDER BY j.updated_at,j.song_id,j.provider LIMIT 1 FOR UPDATE OF j SKIP LOCKED")
      .query((rs,n)->Map.entry(rs.getObject(1,UUID.class),rs.getString(2))).optional();
    if(next.isEmpty())return false;
    UUID id=next.get().getKey();String provider=next.get().getValue();var song=catalog.get(id);
    var candidates=jdbc.sql("SELECT * FROM singflow.catalog_enrichment_candidates WHERE song_id=? AND provider=? ORDER BY position")
      .params(id,provider).query((rs,n)->new Candidate(provider,rs.getString("external_id"),rs.getString("title"),rs.getString("artist"),rs.getString("album"),rs.getInt("duration_ms"),rs.getString("url"),rs.getBoolean("recommended"))).list();
    UUID token=UUID.randomUUID();
    jdbc.sql("UPDATE singflow.catalog_enrichment_jobs SET state='PROCESSING',claim_token=?,lease_until=clock_timestamp()+interval '2 minutes' WHERE song_id=? AND provider=?").params(token,id,provider).update();
    try {
      complete(new Claim(id,provider,song.title(),song.artist(),0,token),candidates);
      // READY with no usable URL should not run forever.
      if(!linked(id,provider))state(id,provider,"NOT_FOUND","");
    } catch(ResponseStatusException error) {state(id,provider,"FAILED","A sugestão salva precisa de revisão manual.");}
    return true;
  }

  private String limit(String value,int length){return value==null?"":value.substring(0,Math.min(length,value.length()));}
  @Transactional
  public void failed(Claim claim,ResponseStatusException error){
    catalog.lock();if(!current(claim))return;
    long delay=60L*(1L<<Math.min(5,claim.attempts()-1));
    if(error.getStatusCode().value()==429)try{delay=Math.max(delay,Math.min(90000,Long.parseLong(error.getHeaders().getFirst("Retry-After"))));}catch(Exception ignored){}
    String next=claim.attempts()<3?"QUEUED":"FAILED";
    jdbc.sql("UPDATE singflow.catalog_enrichment_jobs SET state=?,claim_token=NULL,lease_until=NULL,next_attempt_at=clock_timestamp()+cast(? AS integer)*interval '1 second',message=?,updated_at=clock_timestamp() WHERE song_id=? AND provider=?")
      .params(next,delay,"Busca automática indisponível. Você pode pesquisar manualmente.",claim.songId(),claim.provider()).update();
  }
  @Transactional(readOnly=true)
  public Prepared prepared(String actor,UUID id,String provider){
    catalog.admin(actor);var song=catalog.details(actor,id);
    if(!providers.contains(provider))throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Recurso indisponível.");
    var job=job(id,provider);if(job.isEmpty())return new Prepared(provider,"NOT_SCHEDULED","",List.of());
    if(linked(id,provider))return new Prepared(provider,"REFERENCE_SET","",List.of());
    if(!song.title().equals(job.get().title())||!song.artist().equals(job.get().artist())||!usable(song))return new Prepared(provider,"STALE","Os dados da música mudaram. As sugestões anteriores foram descartadas.",List.of());
    var candidates=jdbc.sql("SELECT * FROM singflow.catalog_enrichment_candidates WHERE song_id=? AND provider=? ORDER BY position")
      .params(id,provider).query((rs,n)->new Candidate(provider,rs.getString("external_id"),rs.getString("title"),rs.getString("artist"),rs.getString("album"),rs.getInt("duration_ms"),rs.getString("url"),rs.getBoolean("recommended"))).list();
    return new Prepared(provider,job.get().state(),job.get().message(),candidates);
  }
}
