package br.tec.flowave.singflow.catalog;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

/** Adapter for the site's public search interface, not a documented third-party API. */
@Service
public class CifraSearch {
  public record Match(String id,String title,String artist,String url,boolean verified,boolean recommended) {}
  public record Page(List<Match> items,int page,boolean hasMore) {}
  private record Cached(long until,Page page) {}
  private final RestClient client;
  private final boolean enabled;
  private final Map<String,Cached> cache=new LinkedHashMap<>();
  private long minute;
  private int calls;
  @Autowired
  public CifraSearch(@Value("${SINGFLOW_CIFRA_SEARCH_ENABLED:true}") boolean enabled) {
    this(buildClient(),enabled);
  }
  CifraSearch(RestClient client,boolean enabled) {this.client=client;this.enabled=enabled;}
  private static RestClient buildClient() {
    var factory=new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build());
    factory.setReadTimeout(Duration.ofSeconds(5));
    return RestClient.builder().baseUrl("https://solr.sscdn.co").requestFactory(factory).build();
  }
  private ResponseStatusException unavailable() {
    return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"A busca de cifras está indisponível. Você pode informar o link manualmente.");
  }
  public synchronized Page search(String query,int page) {
    String q=query==null?"":query.strip();
    if(q.length()>321 || page<1 || page>100) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Confira a busca e a página.");
    if(q.length()<3) return new Page(List.of(),page,false);
    if(!enabled) throw unavailable();
    long now=System.currentTimeMillis();String key=q.toLowerCase(Locale.ROOT)+"|"+page;
    var hit=cache.get(key);if(hit!=null&&hit.until()>now)return hit.page();
    if(minute!=now/60000){minute=now/60000;calls=0;}
    if(++calls>60) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"Aguarde um minuto antes de pesquisar novamente.");
    try {
      Map<?,?> overview=page==1?fetch(q,1,"all"):null;
      Map<?,?> body=fetch(q,page,"songs");
      if(body==null || !(body.get("results") instanceof List<?> rows) || !(body.get("page") instanceof Number current) || !(body.get("total_pages") instanceof Number pages) || current.intValue()!=page) throw unavailable();
      Map<String,Match> unique=new LinkedHashMap<>();
      if(overview!=null && overview.get("top_result") instanceof Map<?,?> top) add(unique,top,true);
      for(Object row:rows) if(row instanceof Map<?,?> data)add(unique,data,false);
      var answer=new Page(List.copyOf(unique.values()),page,page<pages.intValue());
      cache.entrySet().removeIf(e->e.getValue().until()<=now);
      if(cache.size()>=200)cache.remove(cache.keySet().iterator().next());
      cache.put(key,new Cached(now+300000,answer));return answer;
    } catch(org.springframework.web.client.RestClientResponseException e) {
      if(e.getStatusCode().value()==429)throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"Aguarde antes de pesquisar novamente.");
      throw unavailable();
    } catch(ResponseStatusException e){throw e;} catch(Exception e){throw unavailable();}
  }
  private Map<?,?> fetch(String query,int page,String type) {
    return client.get().uri(u->u.path("/cifraclub-explore/v1/search").queryParam("q","{q}").queryParam("_page",page).queryParam("type",type).queryParam("lang","pt").build(query)).retrieve().body(Map.class);
  }
  private void add(Map<String,Match> matches,Map<?,?> row,boolean recommended) {
    if(!"song".equals(row.get("type")) || !(row.get("artist") instanceof Map<?,?> artist))return;
    if(!(row.get("name") instanceof String title) || !(artist.get("name") instanceof String name) || !(row.get("slug") instanceof String songSlug) || !(artist.get("slug") instanceof String artistSlug))return;
    if(title.isBlank()||name.isBlank()||title.length()>160||name.length()>160||!slug(songSlug)||!slug(artistSlug))return;
    String url="https://www.cifraclub.com.br/"+artistSlug+"/"+songSlug+"/";
    matches.putIfAbsent(url,new Match(String.valueOf(row.get("id")),title,name,url,Boolean.TRUE.equals(row.get("verified")),recommended));
  }
  private static boolean slug(String value){return value.length()<=240&&value.matches("[a-z0-9][a-z0-9-]*");}
  /** Validate navigation targets only; never fetch arbitrary user-provided URLs. */
  public static String safeUrl(String input) {
    if(input==null||input.isBlank())return null;
    String value=input.strip();
    try {
      URI uri=URI.create(value);
      if(value.length()>2048||!"https".equals(uri.getScheme())||uri.getHost()==null||!Set.of("www.cifraclub.com.br","cifraclub.com.br").contains(uri.getHost().toLowerCase(Locale.ROOT))||uri.getRawUserInfo()!=null||uri.getPort()!=-1||!uri.getRawPath().matches("/[a-z0-9][a-z0-9-]*/[a-z0-9][a-z0-9-]*(?:/[a-z0-9-]+\\.html)?/?")||Set.of("blog","academy","explorar","assine","mais").contains(uri.getPath().split("/")[1]))throw new IllegalArgumentException();
      return "https://www.cifraclub.com.br"+uri.getRawPath()+(uri.getRawQuery()==null?"":"?"+uri.getRawQuery());
    }catch(Exception e){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Informe um link HTTPS de uma música no Cifra Club.");}
  }
}
