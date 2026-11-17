package br.tec.flowave.singflow.catalog;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

class SpotifySearchTests {
  static final String ID="0123456789abcdefghijkl",URL="https://open.spotify.com/track/"+ID;
  static final String TRACK="{\"id\":\""+ID+"\",\"type\":\"track\",\"name\":\"Giz\",\"artists\":[{\"name\":\"Legião Urbana\"}],\"album\":{\"name\":\"O Descobrimento do Brasil\"},\"duration_ms\":120000}";
  static String page(int offset,String rows,int total){return "{\"tracks\":{\"offset\":"+offset+",\"total\":"+total+",\"items\":["+rows+"]}}";}
  static String token(String value,int expires){return "{\"access_token\":\""+value+"\",\"token_type\":\"Bearer\",\"expires_in\":"+expires+"}";}
  record Fixture(SpotifySearch search,MockRestServiceServer auth,MockRestServiceServer api) {}
  Fixture fixture(){
    var auth=RestClient.builder().baseUrl("https://accounts.spotify.com");var api=RestClient.builder().baseUrl("https://api.spotify.com");
    var authServer=MockRestServiceServer.bindTo(auth).build();var apiServer=MockRestServiceServer.bindTo(api).build();
    return new Fixture(new SpotifySearch(auth.build(),api.build(),"fake-client","fake-secret","BR",true),authServer,apiServer);
  }
  @Test void usesClientCredentialsReturnsTenPerPageAndCachesTokenAndResults(){
    var f=fixture();
    f.auth.expect(requestTo("https://accounts.spotify.com/api/token")).andExpect(method(HttpMethod.POST))
      .andExpect(header("Authorization","Basic "+Base64.getEncoder().encodeToString("fake-client:fake-secret".getBytes(java.nio.charset.StandardCharsets.UTF_8))))
      .andExpect(content().string("grant_type=client_credentials")).andRespond(withSuccess(token("one",3600),MediaType.APPLICATION_JSON));
    f.api.expect(requestTo(org.hamcrest.Matchers.allOf(org.hamcrest.Matchers.containsString("limit=10"),org.hamcrest.Matchers.containsString("offset=0"),org.hamcrest.Matchers.containsString("market=BR"),org.hamcrest.Matchers.containsString("type=track"))))
      .andExpect(header("Authorization","Bearer one")).andRespond(withSuccess(page(0,TRACK+","+TRACK+",{\"type\":\"album\"}",12),MediaType.APPLICATION_JSON));
    f.api.expect(requestTo(org.hamcrest.Matchers.containsString("offset=10"))).andExpect(header("Authorization","Bearer one"))
      .andRespond(withSuccess(page(10,TRACK,12),MediaType.APPLICATION_JSON));
    var first=f.search.search("Giz Legião Urbana",1);assertThat(first.provider()).isEqualTo(new StreamingSearch.Provider("spotify","Spotify","fa-spotify"));
    assertThat(first.items()).hasSize(1);assertThat(first.items().getFirst().type()).isEqualTo("spotify");assertThat(first.items().getFirst().url()).isEqualTo(URL);assertThat(first.hasMore()).isTrue();
    assertThat(f.search.search("Giz Legião Urbana",1)).isEqualTo(first);assertThat(f.search.search("Giz Legião Urbana",2).hasMore()).isFalse();f.auth.verify();f.api.verify();
  }
  @Test void retriesOnlyOnceOnExpiredToken(){
    var f=fixture();f.auth.expect(anything()).andRespond(withSuccess(token("old",3600),MediaType.APPLICATION_JSON));f.auth.expect(anything()).andRespond(withSuccess(token("new",3600),MediaType.APPLICATION_JSON));
    f.api.expect(anything()).andExpect(header("Authorization","Bearer old")).andRespond(withStatus(HttpStatus.UNAUTHORIZED));
    f.api.expect(anything()).andExpect(header("Authorization","Bearer new")).andRespond(withSuccess(page(0,TRACK,1),MediaType.APPLICATION_JSON));
    assertThat(f.search.search("Giz",1).items()).hasSize(1);f.auth.verify();f.api.verify();
  }
  @Test void providerRateLimitSetsCooldownAndDoesNotRetry(){
    var f=fixture();f.auth.expect(anything()).andRespond(withSuccess(token("one",3600),MediaType.APPLICATION_JSON));
    var headers=new HttpHeaders();headers.set("Retry-After","120");f.api.expect(anything()).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).headers(headers));
    for(int n=0;n<2;n++)assertThatThrownBy(()->f.search.search("Giz",1)).isInstanceOfSatisfying(ResponseStatusException.class,e->{assertThat(e.getStatusCode().value()).isEqualTo(429);assertThat(Integer.parseInt(e.getHeaders().getFirst("Retry-After"))).isBetween(119,120);});
    f.auth.verify();f.api.verify();
  }
  @Test void authenticationAndMalformedResponsesDoNotExposeProviderContent(){
    var f=fixture();f.auth.expect(anything()).andRespond(withStatus(HttpStatus.UNAUTHORIZED).body("fake-secret-sensitive-body"));
    assertThatThrownBy(()->f.search.search("Giz",1)).isInstanceOfSatisfying(ResponseStatusException.class,e->{assertThat(e.getStatusCode().value()).isEqualTo(503);assertThat(e.getReason()).doesNotContain("fake-secret");});
    f.auth.verify();f.api.verify();
    var bad=fixture();bad.auth.expect(anything()).andRespond(withSuccess(token("one",3600),MediaType.APPLICATION_JSON));bad.api.expect(anything()).andRespond(withSuccess("{}",MediaType.APPLICATION_JSON));
    assertThatThrownBy(()->bad.search.search("Giz",1)).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(503));
  }
  @Test void missingCredentialsDisabledSearchAndInvalidQueriesNeverMakeRequests(){
    var f=new SpotifySearch(RestClient.create(),RestClient.create(),"","","BR",true);
    assertThat(f.search("ab",1).items()).isEmpty();
    assertThatThrownBy(()->f.search("Giz",1)).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(503));
    assertThatThrownBy(()->f.search("Giz",102)).isInstanceOf(ResponseStatusException.class);
    var disabled=new SpotifySearch(RestClient.create(),RestClient.create(),"fake","fake","BR",false);
    assertThatThrownBy(()->disabled.search("Giz",1)).isInstanceOf(ResponseStatusException.class);
  }
  @Test void acceptsOnlyCanonicalSpotifyTracks(){
    for(String url:List.of("http://open.spotify.com/track/"+ID,"https://evil.test/track/"+ID,"https://open.spotify.com.evil.test/track/"+ID,"https://user@open.spotify.com/track/"+ID,"https://open.spotify.com:444/track/"+ID,"https://open.spotify.com/playlist/"+ID,"https://open.spotify.com/track/bad","javascript:alert(1)"))assertThatThrownBy(()->SpotifySearch.safeUrl(url)).isInstanceOf(ResponseStatusException.class);
    assertThat(SpotifySearch.safeUrl("https://open.spotify.com/intl-pt/track/"+ID+"?si=tracking#x")).isEqualTo(URL);
    assertThat(SpotifySearch.safeUrl(null)).isNull();
  }
}
