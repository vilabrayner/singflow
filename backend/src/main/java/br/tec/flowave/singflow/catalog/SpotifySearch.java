package br.tec.flowave.singflow.catalog;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.*;
import org.springframework.web.server.ResponseStatusException;

/** App-only credentials and access tokens never leave the backend. */
@Service
public class SpotifySearch implements StreamingSearch {
  @Override public Provider provider() { return new Provider("spotify", "Spotify", "fa-spotify"); }
  @Override public String normalizeUrl(String input) { return safeUrl(input); }
  private record Cached(long until, Page page) {}
  private final RestClient auth, api;
  private final String clientId, secret, market;
  private final boolean enabled;
  private final Map<String,Cached> cache = new LinkedHashMap<>();
  private String token;
  private long tokenUntil, minute, retryAt;
  private int searches;

  @Autowired
  public SpotifySearch(@Value("${SPOTIFY_CLIENT_ID:}") String clientId,
      @Value("${SPOTIFY_CLIENT_SECRET:}") String secret,
      @Value("${SPOTIFY_MARKET:BR}") String market,
      @Value("${SINGFLOW_SPOTIFY_SEARCH_ENABLED:true}") boolean enabled) {
    this(client("https://accounts.spotify.com"), client("https://api.spotify.com"), clientId, secret, market, enabled);
  }
  SpotifySearch(RestClient auth, RestClient api, String clientId, String secret, String market, boolean enabled) {
    this.auth=auth; this.api=api; this.clientId=clientId.strip(); this.secret=secret.strip();
    this.market=market.strip().toUpperCase(Locale.ROOT); this.enabled=enabled;
  }
  private static RestClient client(String base) {
    var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build());
    factory.setReadTimeout(Duration.ofSeconds(5));
    return RestClient.builder().baseUrl(base).requestFactory(factory).build();
  }
  private ResponseStatusException unavailable() {
    return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
        "A busca no Spotify está indisponível. Você pode informar o link manualmente.");
  }
  public synchronized Page search(String query, int page) {
    String q=query==null?"":query.strip();
    if(q.length()>321 || page<1 || page>101) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Confira a busca e a página.");
    if(q.length()<3) return new Page(provider(),List.of(),page,false);
    if(!enabled || clientId.isBlank() || secret.isBlank() || !market.matches("[A-Z]{2}")) throw unavailable();
    long now=System.currentTimeMillis();
    var key=q.toLowerCase(Locale.ROOT)+"|"+page;
    var hit=cache.get(key); if(hit!=null && hit.until()>now) return hit.page();
    if(now<retryAt) throw limited((int)Math.max(1,(retryAt-now+999)/1000));
    if(minute!=now/60000){minute=now/60000;searches=0;}
    if(++searches>60) throw limited(60);
    try {
      Map<?,?> body;
      try { body=fetch(q,page); }
      catch(RestClientResponseException e) {
        if(e.getStatusCode().value()!=401) throw e;
        token=null; tokenUntil=0; body=fetch(q,page); // One renewal only, never an unbounded retry.
      }
      if(body==null || !(body.get("tracks") instanceof Map<?,?> tracks)
          || !(tracks.get("items") instanceof List<?> rows)
          || !(tracks.get("offset") instanceof Number offset) || offset.intValue()!=(page-1)*10
          || !(tracks.get("total") instanceof Number total)) throw unavailable();
      Map<String,Track> unique=new LinkedHashMap<>();
      for(Object row:rows) {
        if(!(row instanceof Map<?,?> item) || !"track".equals(item.get("type"))) continue;
        if(!(item.get("id") instanceof String id) || !id.matches("[A-Za-z0-9]{22}")
            || !(item.get("name") instanceof String title) || title.isBlank()
            || !(item.get("artists") instanceof List<?> artists)) continue;
        var names=artists.stream().filter(a->a instanceof Map<?,?>).map(a->((Map<?,?>)a).get("name"))
            .filter(a->a instanceof String && !((String)a).isBlank()).map(Object::toString).toList();
        if(names.isEmpty()) continue;
        String album=item.get("album") instanceof Map<?,?> a && a.get("name") instanceof String n?n:"";
        int duration=item.get("duration_ms") instanceof Number d?Math.max(0,d.intValue()):0;
        unique.putIfAbsent(id,new Track(provider().type(),id,title,String.join(", ",names),album,duration,"https://open.spotify.com/track/"+id));
      }
      var result=new Page(provider(),List.copyOf(unique.values()),page,page<101 && offset.intValue()+10<total.intValue());
      cache.entrySet().removeIf(e->e.getValue().until()<=now);
      if(cache.size()>=200) cache.remove(cache.keySet().iterator().next());
      cache.put(key,new Cached(now+120000,result)); return result;
    } catch(RestClientResponseException e) {
      if(e.getStatusCode().value()==429) {
        int seconds=60;
        try { seconds=Math.max(1,Math.min(3600,Integer.parseInt(e.getResponseHeaders().getFirst(HttpHeaders.RETRY_AFTER)))); }
        catch(Exception ignored) { }
        retryAt=System.currentTimeMillis()+seconds*1000L;
        throw limited(seconds);
      }
      // Do not expose provider bodies, authorization headers, or credential failures.
      throw unavailable();
    } catch(ResponseStatusException e) { throw e; }
    catch(Exception e) { throw unavailable(); }
  }
  private Map<?,?> fetch(String query,int page) {
    return api.get().uri(u->u.path("/v1/search").queryParam("q","{q}").queryParam("type","track")
        .queryParam("market",market).queryParam("limit",10).queryParam("offset",(page-1)*10).build(query))
        .headers(h->h.setBearerAuth(accessToken())).retrieve().body(Map.class);
  }
  private String accessToken() {
    if(token!=null && System.currentTimeMillis()<tokenUntil) return token;
    var body=new LinkedMultiValueMap<String,String>(); body.add("grant_type","client_credentials");
    Map<?,?> result;
    try {
      result=auth.post().uri("/api/token").headers(h->h.setBasicAuth(clientId,secret))
          .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(body).retrieve().body(Map.class);
    } catch(RestClientResponseException e) {
      if(e.getStatusCode().value()==429) throw e;
      throw unavailable();
    }
    if(result==null || !(result.get("access_token") instanceof String value) || value.isBlank()
        || !(result.get("expires_in") instanceof Number expires) || expires.longValue()<=0
        || !(result.get("token_type") instanceof String type) || !type.equalsIgnoreCase("Bearer")) throw unavailable();
    token=value; tokenUntil=System.currentTimeMillis()+Math.max(0,expires.longValue()-30)*1000L;return token;
  }
  private ResponseStatusException limited(int seconds) {
    return new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"Aguarde antes de pesquisar no Spotify novamente.") {
      @Override public HttpHeaders getHeaders(){var headers=new HttpHeaders();headers.set(HttpHeaders.RETRY_AFTER,Integer.toString(seconds));return headers;}
    };
  }
  /** A saved reference must identify a Spotify track, never a playlist or arbitrary website. */
  public static String safeUrl(String input) {
    if(input==null || input.isBlank()) return null;
    try {
      var uri=URI.create(input.strip());
      if(input.length()>2048 || !"https".equals(uri.getScheme()) || !"open.spotify.com".equalsIgnoreCase(uri.getHost())
          || uri.getRawUserInfo()!=null || uri.getPort()!=-1
          || !uri.getRawPath().matches("/(?:intl-[a-z]{2}/)?track/[A-Za-z0-9]{22}/?")) throw new IllegalArgumentException();
      String id=uri.getPath().replaceAll("/$","");id=id.substring(id.lastIndexOf('/')+1);
      return "https://open.spotify.com/track/"+id;
    } catch(Exception e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Informe o link HTTPS de uma música no Spotify."); }
  }
}
