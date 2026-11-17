package br.tec.flowave.singflow.catalog;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

class YouTubeSearchTests {
  static final String ID="Abcde_12-XY",URL="https://www.youtube.com/watch?v="+ID;
  static final String VIDEO="{\"id\":{\"kind\":\"youtube#video\",\"videoId\":\""+ID+"\"},\"snippet\":{\"title\":\"Giz &amp; música\",\"channelTitle\":\"Legião Urbana\"}}";
  static String page(String rows,String token){return "{\"kind\":\"youtube#searchListResponse\",\"items\":["+rows+"]"+(token==null?"":",\"nextPageToken\":\""+token+"\"")+"}";}
  static class Time extends Clock {
    long millis=Instant.parse("2026-11-17T07:59:00Z").toEpochMilli();
    @Override public ZoneId getZone(){return ZoneOffset.UTC;}
    @Override public Clock withZone(ZoneId zone){return Clock.fixed(instant(),zone);}
    @Override public Instant instant(){return Instant.ofEpochMilli(millis);}
    @Override public long millis(){return millis;}
  }
  record Fixture(YouTubeSearch search,MockRestServiceServer server,Time time){}
  Fixture fixture(int limit){var builder=RestClient.builder().baseUrl("https://www.googleapis.com");var server=MockRestServiceServer.bindTo(builder).build();var time=new Time();return new Fixture(new YouTubeSearch(builder.build(),"fake-key",true,limit,time),server,time);}
  @Test void searchesVideosWithPrivateHeaderRelevanceTenResultsAndOpaquePagination(){
    var f=fixture(100);
    f.server.expect(requestTo(org.hamcrest.Matchers.allOf(org.hamcrest.Matchers.containsString("type=video"),org.hamcrest.Matchers.containsString("order=relevance"),org.hamcrest.Matchers.containsString("maxResults=10"),org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("key=")))))
      .andExpect(header("X-Goog-Api-Key","fake-key")).andRespond(withSuccess(page(VIDEO+","+VIDEO+",{\"id\":{\"kind\":\"youtube#channel\",\"videoId\":\"bad\"}}","cursor_2"),MediaType.APPLICATION_JSON));
    f.server.expect(requestTo(org.hamcrest.Matchers.containsString("pageToken=cursor_2"))).andRespond(withSuccess(page(VIDEO,null),MediaType.APPLICATION_JSON));
    var first=f.search.search("Giz Legião Urbana",1);assertThat(first.items()).hasSize(1);assertThat(first.items().getFirst().title()).isEqualTo("Giz & música");assertThat(first.items().getFirst().url()).isEqualTo(URL);assertThat(first.provider().icon()).isEqualTo("fa-youtube");assertThat(first.hasMore()).isTrue();
    assertThat(f.search.search("Giz Legião Urbana",1)).isEqualTo(first);assertThat(f.search.search("Giz Legião Urbana",2).hasMore()).isFalse();f.server.verify();
  }
  @Test void expiredOrMissingCursorDoesNotSpendQuotaReplayingEarlierPages(){
    var f=fixture(100);f.server.expect(anything()).andRespond(withSuccess(page(VIDEO,"next"),MediaType.APPLICATION_JSON));
    assertThatThrownBy(()->f.search.search("Giz",2)).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(409));
    f.search.search("Giz",1);f.time.millis+=301000;
    assertThatThrownBy(()->f.search.search("Giz",2)).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(409));f.server.verify();
  }
  @Test void restartingAnExpiredSearchInvalidatesOldLaterPages(){
    var f=fixture(100);
    f.server.expect(anything()).andRespond(withSuccess(page(VIDEO,"old_cursor"),MediaType.APPLICATION_JSON));
    f.server.expect(requestTo(org.hamcrest.Matchers.containsString("pageToken=old_cursor"))).andRespond(withSuccess(page(VIDEO,null),MediaType.APPLICATION_JSON));
    f.server.expect(anything()).andRespond(withSuccess(page(VIDEO,"new_cursor"),MediaType.APPLICATION_JSON));
    f.server.expect(requestTo(org.hamcrest.Matchers.containsString("pageToken=new_cursor"))).andRespond(withSuccess(page(VIDEO,null),MediaType.APPLICATION_JSON));
    f.search.search("Giz",1);f.time.millis+=240000;f.search.search("Giz",2);
    f.time.millis+=61000;f.search.search("Giz",1);f.search.search("Giz",2);f.server.verify();
  }
  @Test void dailyBudgetResetsAtPacificMidnightAndCachedResultsDoNotConsumeCalls(){
    var f=fixture(1);f.server.expect(anything()).andRespond(withSuccess(page(VIDEO,null),MediaType.APPLICATION_JSON));f.server.expect(anything()).andRespond(withSuccess(page(VIDEO,null),MediaType.APPLICATION_JSON));
    f.search.search("Giz",1);f.search.search("Giz",1);
    assertThatThrownBy(()->f.search.search("Other",1)).isInstanceOfSatisfying(ResponseStatusException.class,e->{assertThat(e.getStatusCode().value()).isEqualTo(429);assertThat(e.getHeaders().getFirst("Retry-After")).isEqualTo("60");});
    f.time.millis+=60000;assertThat(f.search.search("Other",1).items()).hasSize(1);f.server.verify();
  }
  @Test void providerQuotaExhaustionStopsSubsequentCallsAndKeepsManualGuidance(){
    var f=fixture(100);f.server.expect(anything()).andRespond(withStatus(HttpStatus.FORBIDDEN).contentType(MediaType.APPLICATION_JSON).body("{\"error\":{\"errors\":[{\"reason\":\"quotaExceeded\"}]}}"));
    for(int i=0;i<2;i++)assertThatThrownBy(()->f.search.search("Giz",1)).isInstanceOfSatisfying(ResponseStatusException.class,e->{assertThat(e.getStatusCode().value()).isEqualTo(429);assertThat(e.getReason()).contains("link manualmente");});f.server.verify();
  }
  @Test void rateLimitCooldownIsNotRetried(){
    var f=fixture(100);var headers=new HttpHeaders();headers.set("Retry-After","120");f.server.expect(anything()).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).headers(headers));
    for(int i=0;i<2;i++)assertThatThrownBy(()->f.search.search("Giz",1)).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getHeaders().getFirst("Retry-After")).isEqualTo("120"));f.server.verify();
  }
  @Test void disabledMissingKeyInvalidAndShortSearchesDoNotCallProvider(){
    for(var search:List.of(new YouTubeSearch(RestClient.create(),"",true,100,Clock.systemUTC()),new YouTubeSearch(RestClient.create(),"fake",false,100,Clock.systemUTC()))){
      assertThat(search.search("ab",1).items()).isEmpty();assertThatThrownBy(()->search.search("Giz",1)).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(503));
      assertThatThrownBy(()->search.search("Giz",101)).isInstanceOf(ResponseStatusException.class);
    }
  }
  @Test void invalidKeyAndMalformedResponsesRemainErrorsWithoutLeakingSecrets(){
    var f=fixture(100);f.server.expect(anything()).andRespond(withStatus(HttpStatus.FORBIDDEN).body("fake-key sensitive provider text"));
    assertThatThrownBy(()->f.search.search("Giz",1)).isInstanceOfSatisfying(ResponseStatusException.class,e->{assertThat(e.getStatusCode().value()).isEqualTo(503);assertThat(e.getReason()).doesNotContain("fake-key");});
    f.server.verify();var malformed=fixture(100);malformed.server.expect(anything()).andRespond(withSuccess("{}",MediaType.APPLICATION_JSON));
    assertThatThrownBy(()->malformed.search.search("Giz",1)).isInstanceOf(ResponseStatusException.class);
  }
  @Test void normalizesVideoLinksAndRejectsOtherDestinations(){
    for(String input:List.of(URL+"&list=playlist&t=20", "https://youtu.be/"+ID+"?si=tracking", "https://m.youtube.com/shorts/"+ID+"/", "https://music.youtube.com/watch?v="+ID,"https://www.youtube.com/live/"+ID,"https://youtube.com/embed/"+ID))assertThat(YouTubeSearch.safeUrl(input)).isEqualTo(URL);
    for(String input:List.of("http://youtu.be/"+ID,"https://youtu.be.evil.test/"+ID,"https://user@youtu.be/"+ID,"https://youtu.be:444/"+ID,"https://www.youtube.com/playlist?list=123","https://www.youtube.com/redirect?v="+ID,"https://www.youtube.com/watch?v="+ID+"&v=xxxxxxxxxxx","https://www.youtube.com/watch?v=bad","javascript:alert(1)"))assertThatThrownBy(()->YouTubeSearch.safeUrl(input)).isInstanceOf(ResponseStatusException.class);
    assertThat(YouTubeSearch.safeUrl(null)).isNull();
  }
}
