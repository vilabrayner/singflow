package br.tec.flowave.singflow.catalog;

import jakarta.annotation.PreDestroy;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Configuration(proxyBeanMethods=false)
@EnableScheduling
@ConditionalOnProperty(name={"SINGFLOW_ENRICHMENT_ENABLED","SINGFLOW_ENRICHMENT_WORKER_ENABLED"},havingValue="true",matchIfMissing=true)
class CatalogEnrichmentWorker {
  private final CatalogEnrichment queue;
  private final CifraSearch cifra;
  private final LyricsSessionCache lyrics;
  private final Map<String,StreamingSearch> streaming=new HashMap<>();
  private final AtomicBoolean running=new AtomicBoolean();
  private final ExecutorService executor=new ThreadPoolExecutor(0,1,30,TimeUnit.SECONDS,new ArrayBlockingQueue<>(1),r->{var thread=new Thread(r,"singflow-catalog-enrichment");thread.setDaemon(true);return thread;},new ThreadPoolExecutor.AbortPolicy());
  CatalogEnrichmentWorker(CatalogEnrichment queue,CifraSearch cifra,LyricsSessionCache lyrics,List<StreamingSearch> streaming){this.queue=queue;this.cifra=cifra;this.lyrics=lyrics;streaming.forEach(p->this.streaming.put(p.provider().type(),p));}
  @Scheduled(fixedDelay=2000,initialDelay=3000)
  public void tick(){
    if(!running.compareAndSet(false,true))return;
    try{executor.execute(()->{try{processOne();}catch(RuntimeException e){org.slf4j.LoggerFactory.getLogger(getClass()).warn("Resource preparation will resume from persisted state.");}finally{running.set(false);}});}
    catch(RejectedExecutionException e){running.set(false);}
  }
  void processOne(){
    if(queue.applyPrepared())return;
    var next=queue.claim();if(next.isEmpty())return;var claim=next.get();
    try{
      List<CatalogEnrichment.Candidate> candidates;
      if(claim.provider().equals("lyrics")){lyrics.findForSong(claim.songId(),claim.title(),claim.artist());candidates=List.of();}
      else if(claim.provider().equals("cifra"))candidates=cifra.search(claim.title()+" "+claim.artist(),1).items().stream()
        .map(c->new CatalogEnrichment.Candidate("cifra",c.id(),c.title(),c.artist(),"",0,c.url(),c.recommended())).toList();
      else{
        var provider=streaming.get(claim.provider());if(provider==null)throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        candidates=provider.search(claim.title()+" "+claim.artist(),1).items().stream()
          .map(c->new CatalogEnrichment.Candidate(c.type(),c.id(),c.title(),c.artist(),c.album(),c.durationMs(),c.url(),false)).toList();
      }
      queue.complete(claim,candidates);
    }catch(ResponseStatusException e){queue.failed(claim,e);}catch(RuntimeException e){queue.failed(claim,new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE));}
  }
  @PreDestroy public void close(){executor.shutdownNow();}
}
