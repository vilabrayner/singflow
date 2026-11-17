package br.tec.flowave.singflow.catalog;

import jakarta.annotation.PreDestroy;
import java.util.Locale;
import java.util.UUID;
import java.util.Set;
import java.util.concurrent.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Best-effort cache warming: bounded queue, no caller-runs policy and no durable job/database state. */
@Service
public class LyricsPrefetch {
  private static final Logger log=LoggerFactory.getLogger(LyricsPrefetch.class);
  private record Song(UUID session,String title,String artist) {}
  private final LyricsSessionCache search;
  private final boolean enabled;
  private final ExecutorService executor;
  private final Set<Song> pending=ConcurrentHashMap.newKeySet();
  @Autowired
  public LyricsPrefetch(LyricsSessionCache search,@Value("${SINGFLOW_LYRICS_ENABLED:true}") boolean lyricsEnabled,
      @Value("${SINGFLOW_LYRICS_PREFETCH_ENABLED:true}") boolean prefetchEnabled){
    this(search,lyricsEnabled&&prefetchEnabled,worker());
  }
  LyricsPrefetch(LyricsSessionCache search,boolean enabled,ExecutorService executor){this.search=search;this.enabled=enabled;this.executor=executor;}
  private static ExecutorService worker(){
    return new ThreadPoolExecutor(0,1,30,TimeUnit.SECONDS,new ArrayBlockingQueue<>(32),task->{
      var thread=new Thread(task,"singflow-lyrics-prefetch");thread.setDaemon(true);return thread;
    },new ThreadPoolExecutor.AbortPolicy());
  }
  public boolean prepare(UUID session,String title,String artist){
    if(!enabled||session==null||title==null||artist==null||title.isBlank()||artist.isBlank()||title.length()>160||artist.length()>160)return false;
    var key=new Song(session,title.strip().toLowerCase(Locale.ROOT),artist.strip().toLowerCase(Locale.ROOT));
    if(!pending.add(key))return false;
    try{
      executor.execute(()->{
        try{search.find(session,title,artist);}
        catch(RuntimeException e){log.debug("Lyrics cache warming did not complete; on-demand lookup remains available.");}
        finally{pending.remove(key);}
      });
      return true;
    }catch(RejectedExecutionException e){
      pending.remove(key);log.debug("Lyrics warming queue unavailable; on-demand lookup remains available.");return false;
    }
  }
  @PreDestroy public void close(){executor.shutdownNow();pending.clear();}
}
