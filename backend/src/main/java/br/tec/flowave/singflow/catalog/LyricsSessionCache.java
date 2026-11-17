package br.tec.flowave.singflow.catalog;

import java.text.Normalizer;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Function;
import java.util.function.LongSupplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Found lyrics are retained only while at least one consuming karaoke session remains open. */
@Service
public class LyricsSessionCache {
  private record Key(String title,String artist) {}
  private static final class Entry {
    final Set<UUID> owners=new HashSet<>();
    final CompletableFuture<LyricsSearch.Result> pending=new CompletableFuture<>();
    LyricsSearch.Result result;
    long until;
  }
  private final LyricsSearch search;
  private final Function<Set<UUID>,Set<UUID>> openSessions;
  private final Function<UUID,Set<UUID>> songSessions;
  private final LongSupplier now;
  private final Map<Key,Entry> cache=new HashMap<>();
  private final Object monitor=new Object();
  @Autowired
  public LyricsSessionCache(LyricsSearch search,JdbcClient jdbc){
    this(search,ids->{
      if(ids.isEmpty())return Set.of();
      return new HashSet<>(jdbc.sql("SELECT id FROM singflow.sessions WHERE id IN (:ids) AND status='OPEN'").param("ids",ids).query(UUID.class).list());
    },song->new HashSet<>(jdbc.sql("""
      SELECT DISTINCT s.id FROM singflow.sessions s WHERE s.status='OPEN' AND (
        EXISTS(SELECT 1 FROM singflow.song_requests r WHERE r.session_id=s.id AND r.catalog_song_id=:song) OR
        EXISTS(SELECT 1 FROM singflow.stage_calls c WHERE c.session_id=s.id AND c.catalog_song_id=:song))
      """).param("song",song).query(UUID.class).list()));
  }
  LyricsSessionCache(LyricsSearch search,Function<Set<UUID>,Set<UUID>> openSessions,Function<UUID,Set<UUID>> songSessions){
    this(search,openSessions,songSessions,System::currentTimeMillis);
  }
  LyricsSessionCache(LyricsSearch search,Function<Set<UUID>,Set<UUID>> openSessions,Function<UUID,Set<UUID>> songSessions,LongSupplier now){
    this.search=search;this.openSessions=openSessions;this.songSessions=songSessions;this.now=now;
  }
  public LyricsSearch.Result find(UUID session,String title,String artist){return find(Set.of(session),title,artist);}
  public LyricsSearch.Result findForSong(UUID song,String title,String artist){return find(songSessions.apply(song),title,artist);}
  private String normalize(String value){return Normalizer.normalize(value==null?"":value.strip(),Normalizer.Form.NFD).replaceAll("\\p{M}","").toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]+"," ").strip();}
  private LyricsSearch.Result find(Set<UUID> sessions,String title,String artist){
    var active=openSessions.apply(Set.copyOf(sessions));
    if(active.isEmpty())return null;
    Key key=new Key(normalize(title),normalize(artist));Entry entry;boolean producer=false;LyricsSearch.Result answer;
    synchronized(monitor){
      entry=cache.get(key);
      if(entry!=null&&entry.result!=null&&entry.until<=now.getAsLong()){cache.remove(key);entry=null;}
      if(entry==null){entry=new Entry();cache.put(key,entry);producer=true;}
      entry.owners.addAll(active);
      answer=entry.result;
    }
    if(producer){
      try{
        answer=search.find(title,artist);
        if(answer==null)throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Não foi possível carregar a letra agora.");
        Set<UUID> owners; synchronized(monitor){owners=Set.copyOf(entry.owners);}
        var stillOpen=openSessions.apply(owners);var closed=new HashSet<>(owners);closed.removeAll(stillOpen);
        synchronized(monitor){
          entry.owners.removeAll(closed);
          if(cache.get(key)==entry){
            if(entry.owners.isEmpty())cache.remove(key);
            else{entry.result=answer;entry.until=answer!=null&&answer.status().equals("FOUND")?Long.MAX_VALUE:now.getAsLong()+120000;}
          }
        }
        entry.pending.complete(answer);
      }catch(RuntimeException e){
        synchronized(monitor){cache.remove(key,entry);}
        entry.pending.completeExceptionally(e);throw e;
      }
    }else if(answer==null){
      try{answer=entry.pending.get();}
      catch(InterruptedException e){Thread.currentThread().interrupt();throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"A consulta da letra foi interrompida.");}
      catch(ExecutionException e){if(e.getCause() instanceof RuntimeException failure)throw failure;throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Não foi possível carregar a letra agora.");}
    }
    // Also covers a close that committed just before this lookup registered its owner.
    var stillActive=openSessions.apply(active);
    for(UUID id:active)if(!stillActive.contains(id))closeSession(id);
    return stillActive.isEmpty()?null:answer;
  }
  /** Called only after session closure commits. Never waits for provider I/O. */
  public void closeSession(UUID session){
    synchronized(monitor){cache.entrySet().removeIf(row->{row.getValue().owners.remove(session);return row.getValue().owners.isEmpty();});}
  }
}
