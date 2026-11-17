package br.tec.flowave.singflow.catalog;

import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.HtmlUtils;

/** Public-video adapter. Pagination tokens and the API key remain on the server. */
@Service
public class YouTubeSearch implements StreamingSearch {
  private static final ZoneId QUOTA_ZONE=ZoneId.of("America/Los_Angeles");
  private record Cached(long until,Page page,String nextToken) {}
  private record Key(String query,int page) {}
  private final RestClient api;
  private final String key;
  private final boolean enabled;
  private final int dailyLimit;
  private final Clock clock;
  private final Map<Key,Cached> cache=new LinkedHashMap<>();
  private LocalDate quotaDay;
  private int calls;
  private long retryAt;
  @Autowired
  public YouTubeSearch(@Value("${YOUTUBE_API_KEY:}") String key,
      @Value("${SINGFLOW_YOUTUBE_SEARCH_ENABLED:true}") boolean enabled,
      @Value("${YOUTUBE_SEARCH_LIMIT_PER_DAY:100}") int dailyLimit) {
    this(client(),key,enabled,dailyLimit,Clock.systemUTC());
  }
  YouTubeSearch(RestClient api,String key,boolean enabled,int dailyLimit,Clock clock){
    this.api=api;this.key=key.strip();this.enabled=enabled;this.dailyLimit=Math.max(0,dailyLimit);this.clock=clock;
  }
  private static RestClient client(){
    var factory=new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build());
    factory.setReadTimeout(Duration.ofSeconds(5));return RestClient.builder().baseUrl("https://www.googleapis.com").requestFactory(factory).build();
  }
  @Override public Provider provider(){return new Provider("youtube","YouTube","fa-youtube");}
  @Override public String normalizeUrl(String input){return safeUrl(input);}
  private ResponseStatusException unavailable(){return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"A busca no YouTube está indisponível. Você pode informar o link manualmente.");}
  @Override public synchronized Page search(String query,int page){
    String q=query==null?"":query.strip();
    if(q.length()>321||page<1||page>100)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Confira a busca e a página.");
    if(q.length()<3)return new Page(provider(),List.of(),page,false);
    if(!enabled||key.isBlank())throw unavailable();
    long now=clock.millis();String normalized=q.toLowerCase(Locale.ROOT);
    var hit=cache.get(new Key(normalized,page));if(hit!=null&&hit.until()>now)return hit.page();
    String token=null;
    if(page>1){
      var previous=cache.get(new Key(normalized,page-1));
      if(previous==null||previous.until()<=now)throw new ResponseStatusException(HttpStatus.CONFLICT,"A busca no YouTube expirou. Pesquise novamente para carregar mais vídeos.");
      token=previous.nextToken();
      if(token==null)return new Page(provider(),List.of(),page,false);
    }
    LocalDate today=LocalDate.now(clock.withZone(QUOTA_ZONE));
    if(!today.equals(quotaDay)){quotaDay=today;calls=0;}
    if(calls>=dailyLimit)throw quotaExceeded();
    if(now<retryAt)throw limited((int)Math.max(1,(retryAt-now+999)/1000),"Aguarde antes de pesquisar no YouTube novamente.");
    calls++; // Every outbound attempt consumes quota, including failed requests.
    final String next=token;
    try {
      Map<?,?> body=api.get().uri(u->{
        u.path("/youtube/v3/search").queryParam("part","snippet").queryParam("type","video")
          .queryParam("order","relevance").queryParam("maxResults",10).queryParam("regionCode","BR")
          .queryParam("relevanceLanguage","pt").queryParam("q","{q}");
        if(next!=null)u.queryParam("pageToken","{token}");
        return next==null?u.build(q):u.build(q,next);
      }).header("X-Goog-Api-Key",key).retrieve().body(Map.class);
      if(body==null||!"youtube#searchListResponse".equals(body.get("kind"))||!(body.get("items") instanceof List<?> rows))throw unavailable();
      Map<String,Track> result=new LinkedHashMap<>();
      for(Object row:rows){
        if(!(row instanceof Map<?,?> item)||!(item.get("id") instanceof Map<?,?> id)||!"youtube#video".equals(id.get("kind"))
            ||!(id.get("videoId") instanceof String video)||!video.matches("[A-Za-z0-9_-]{11}")
            ||!(item.get("snippet") instanceof Map<?,?> snippet)||!(snippet.get("title") instanceof String title)||title.isBlank()
            ||!(snippet.get("channelTitle") instanceof String channel)||channel.isBlank())continue;
        // A channel name identifies the uploader; it is not asserted to be the song's artist.
        result.putIfAbsent(video,new Track("youtube",video,HtmlUtils.htmlUnescape(title),HtmlUtils.htmlUnescape(channel),"",0,"https://www.youtube.com/watch?v="+video));
      }
      String nextToken=body.get("nextPageToken") instanceof String value&&!value.isBlank()?value:null;
      var answer=new Page(provider(),List.copyOf(result.values()),page,nextToken!=null&&page<100);
      cache.entrySet().removeIf(e->e.getValue().until()<=now);
      if(page==1)cache.keySet().removeIf(k->k.query().equals(normalized));
      if(cache.size()>=200)cache.remove(cache.keySet().iterator().next());
      cache.put(new Key(normalized,page),new Cached(now+300000,answer,nextToken));return answer;
    }catch(RestClientResponseException e){
      if(e.getStatusCode().value()==403&&quotaFailure(e)){calls=dailyLimit;throw quotaExceeded();}
      if(e.getStatusCode().value()==429){
        int seconds=60;try{seconds=Math.max(1,Math.min(3600,Integer.parseInt(e.getResponseHeaders().getFirst(HttpHeaders.RETRY_AFTER))));}catch(Exception ignored){}
        retryAt=clock.millis()+seconds*1000L;throw limited(seconds,"Aguarde antes de pesquisar no YouTube novamente.");
      }
      // Never expose provider bodies, the key or request headers to clients/logs.
      throw unavailable();
    }catch(ResponseStatusException e){throw e;}catch(Exception e){throw unavailable();}
  }
  private boolean quotaFailure(RestClientResponseException e){
    try{
      var body=e.getResponseBodyAs(Map.class);
      if(body!=null&&body.get("error") instanceof Map<?,?> error&&error.get("errors") instanceof List<?> errors)
        return errors.stream().anyMatch(value->value instanceof Map<?,?> row&&Set.of("quotaExceeded","dailyLimitExceeded").contains(row.get("reason")));
    }catch(Exception ignored){}
    return false;
  }
  private ResponseStatusException quotaExceeded(){
    long reset=LocalDate.now(clock.withZone(QUOTA_ZONE)).plusDays(1).atStartOfDay(QUOTA_ZONE).toInstant().toEpochMilli();
    return limited((int)Math.max(1,(reset-clock.millis()+999)/1000),"O limite diário de buscas no YouTube foi atingido. Você pode informar o link manualmente.");
  }
  private ResponseStatusException limited(int seconds,String message){
    return new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,message){
      @Override public HttpHeaders getHeaders(){var headers=new HttpHeaders();headers.set(HttpHeaders.RETRY_AFTER,Integer.toString(seconds));return headers;}
    };
  }
  public static String safeUrl(String input){
    if(input==null||input.isBlank())return null;
    try{
      var uri=URI.create(input.strip());String host=uri.getHost()==null?"":uri.getHost().toLowerCase(Locale.ROOT);
      if(input.length()>2048||!"https".equals(uri.getScheme())||uri.getRawUserInfo()!=null||uri.getPort()!=-1)throw new IllegalArgumentException();
      String id=null,path=uri.getRawPath();
      if(host.equals("youtu.be")&&path.matches("/[A-Za-z0-9_-]{11}/?"))id=path.substring(1).replaceAll("/$","");
      else if(Set.of("youtube.com","www.youtube.com","m.youtube.com","music.youtube.com").contains(host)){
        if(path.equals("/watch")||path.equals("/watch/")){
          var values=new ArrayList<String>();
          for(String pair:(uri.getRawQuery()==null?"":uri.getRawQuery()).split("&")){
            String[] parts=pair.split("=",2);
            if(URLDecoder.decode(parts[0],StandardCharsets.UTF_8).equals("v")&&parts.length==2)values.add(URLDecoder.decode(parts[1],StandardCharsets.UTF_8));
          }
          if(values.size()==1)id=values.getFirst();
        }else if(path.matches("/(shorts|live|embed)/[A-Za-z0-9_-]{11}/?"))id=path.replaceAll("/$","").substring(path.indexOf('/',1)+1).replaceAll("/$","");
      }
      if(id==null||!id.matches("[A-Za-z0-9_-]{11}"))throw new IllegalArgumentException();
      return "https://www.youtube.com/watch?v="+id;
    }catch(Exception e){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Informe o link HTTPS de um vídeo no YouTube.");}
  }
}
