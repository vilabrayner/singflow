package br.tec.flowave.singflow.catalog;

import java.net.http.HttpClient;
import java.text.Normalizer;
import java.time.Duration;
import java.util.*;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.*;
import org.springframework.web.server.ResponseStatusException;

@Service
public class LrclibLyricsSearch implements LyricsSearch {
  private final RestClient api;
  private final String client;
  private final boolean enabled;
  private final Object requestLock=new Object();
  private long nextRequestAt,retryAt;
  @Autowired
  public LrclibLyricsSearch(@Value("${SINGFLOW_LYRICS_ENABLED:true}") boolean enabled,
      @Value("${SINGFLOW_LYRICS_CLIENT:SingFlow/0.1 (https://singflow.flowave.tec.br)}") String client){
    this(buildClient(),enabled,client);
  }
  LrclibLyricsSearch(RestClient api,boolean enabled,String client){this.api=api;this.enabled=enabled;this.client=client;}
  private static RestClient buildClient(){
    var factory=new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build());
    factory.setReadTimeout(Duration.ofSeconds(5));return RestClient.builder().baseUrl("https://lrclib.net").requestFactory(factory).build();
  }
  private String normalize(String value){return Normalizer.normalize(value,Normalizer.Form.NFD).replaceAll("\\p{M}","").toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]+"," ").strip();}
  private Result result(String status,String title,String artist,String text,String source){return new Result(status,"LRCLIB",title,artist,text,source);}
  private ResponseStatusException unavailable(){return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Não foi possível carregar a letra agora. Tente novamente em instantes.");}
  @Override public Result find(String inputTitle,String inputArtist){
    String title=inputTitle==null?"":inputTitle.strip(),artist=inputArtist==null?"":inputArtist.strip();
    if(!enabled)throw unavailable();
    if(title.isBlank()||title.length()>160)return result("NOT_FOUND",title,artist,null,null);
    if(artist.isBlank()||artist.length()>160)return result("MISSING_ARTIST",title,artist,null,null);
    synchronized(requestLock){
    long now=System.currentTimeMillis();
    if(now<retryAt)throw limited((int)Math.max(1,(retryAt-now+999)/1000));
    long pause=nextRequestAt-now;
    if(pause>0)try{Thread.sleep(pause);}catch(InterruptedException e){Thread.currentThread().interrupt();throw unavailable();}
    Result answer;
    try{
      Map<?,?> body=api.get().uri(u->u.path("/api/get").queryParam("track_name","{title}").queryParam("artist_name","{artist}").build(title,artist))
          .header("User-Agent",client).retrieve().body(Map.class);
      if(body==null||!(body.get("id") instanceof Number id)||id.longValue()<=0
          ||!(body.get("trackName") instanceof String foundTitle)||!(body.get("artistName") instanceof String foundArtist))throw unavailable();
      if(!normalize(foundTitle).equals(normalize(title))||!normalize(foundArtist).equals(normalize(artist)))answer=result("NOT_FOUND",title,artist,null,null);
      else if(Boolean.TRUE.equals(body.get("instrumental")))answer=result("INSTRUMENTAL",title,artist,null,"https://lrclib.net/tracks/"+id.longValue());
      else if(body.get("plainLyrics") instanceof String text&&!text.isBlank()&&text.length()<=100000)
        answer=result("FOUND",title,artist,text.replace("\r\n","\n"),"https://lrclib.net/tracks/"+id.longValue());
      else answer=result("NOT_FOUND",title,artist,null,null);
    }catch(RestClientResponseException e){
      if(e.getStatusCode().value()==404)answer=result("NOT_FOUND",title,artist,null,null);
      else if(e.getStatusCode().value()==429){
        int seconds=60;try{seconds=Math.max(1,Math.min(3600,Integer.parseInt(e.getResponseHeaders().getFirst(HttpHeaders.RETRY_AFTER))));}catch(Exception ignored){}
        retryAt=System.currentTimeMillis()+seconds*1000L;throw limited(seconds);
      }else throw unavailable();
    }catch(ResponseStatusException e){throw e;}catch(Exception e){throw unavailable();}
    finally{nextRequestAt=System.currentTimeMillis()+300;}
    return answer;
    }
  }
  private ResponseStatusException limited(int seconds){return new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"A busca de letras está temporariamente limitada. Aguarde antes de tentar novamente."){
    @Override public HttpHeaders getHeaders(){var headers=new HttpHeaders();headers.set(HttpHeaders.RETRY_AFTER,Integer.toString(seconds));return headers;}
  };}
}
