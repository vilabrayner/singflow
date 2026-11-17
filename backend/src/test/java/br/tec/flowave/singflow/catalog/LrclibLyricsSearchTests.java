package br.tec.flowave.singflow.catalog;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

class LrclibLyricsSearchTests {
  static String record(String title,String artist,String fields){return "{\"id\":123,\"trackName\":\""+title+"\",\"artistName\":\""+artist+"\","+fields+"}";}
  record Fixture(LrclibLyricsSearch search,MockRestServiceServer server){}
  Fixture fixture(){var builder=RestClient.builder().baseUrl("https://lrclib.net");var server=MockRestServiceServer.bindTo(builder).build();return new Fixture(new LrclibLyricsSearch(builder.build(),true,"SingFlow/test (https://example.test)"),server);}
  @Test void fetchesMatchingPlainTextWithAttribution(){
    var f=fixture();f.server.expect(requestTo(org.hamcrest.Matchers.containsString("track_name=Giz"))).andExpect(header("User-Agent","SingFlow/test (https://example.test)"))
      .andRespond(withSuccess(record("Giz","Legiao Urbana","\"instrumental\":false,\"plainLyrics\":\"Linha de teste um\\nLinha de teste dois\""),MediaType.APPLICATION_JSON));
    var result=f.search.find("Giz","Legião Urbana");assertThat(result.status()).isEqualTo("FOUND");assertThat(result.text()).isEqualTo("Linha de teste um\nLinha de teste dois");assertThat(result.sourceUrl()).isEqualTo("https://lrclib.net/tracks/123");
    f.server.verify();
  }
  @Test void doesNotDisplayProviderMismatchOrSyncedOnlyText(){
    var f=fixture();f.server.expect(anything()).andRespond(withSuccess(record("Giz Ao Vivo","Outro Artista","\"plainLyrics\":\"Texto indevido\""),MediaType.APPLICATION_JSON));
    var result=f.search.find("Giz","Legião Urbana");assertThat(result.status()).isEqualTo("NOT_FOUND");assertThat(result.text()).isNull();
    var synced=fixture();synced.server.expect(anything()).andRespond(withSuccess(record("Giz","Legião Urbana","\"plainLyrics\":null,\"syncedLyrics\":\"[00:01]Linha de teste\""),MediaType.APPLICATION_JSON));
    assertThat(synced.search.find("Giz","Legião Urbana").text()).isNull();
  }
  @Test void handlesInstrumentalAndMissingTracksWithoutInventingText(){
    var f=fixture();f.server.expect(anything()).andRespond(withSuccess(record("Giz","Legião Urbana","\"instrumental\":true"),MediaType.APPLICATION_JSON));assertThat(f.search.find("Giz","Legião Urbana").status()).isEqualTo("INSTRUMENTAL");
    var missing=fixture();missing.server.expect(anything()).andRespond(withStatus(HttpStatus.NOT_FOUND));assertThat(missing.search.find("Giz","Legião Urbana").status()).isEqualTo("NOT_FOUND");missing.server.verify();
  }
  @Test void missingMetadataDoesNotCallProviderAndDisabledFeatureReportsUnavailable(){
    var f=fixture();assertThat(f.search.find("Giz",null).status()).isEqualTo("MISSING_ARTIST");assertThat(f.search.find(null,"Artist").status()).isEqualTo("NOT_FOUND");f.server.verify();
    assertThatThrownBy(()->new LrclibLyricsSearch(RestClient.create(),false,"Test").find("Giz","Artist")).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(503));
  }
  @Test void respectsRetryAfterWithoutRetrying(){
    var f=fixture();var headers=new HttpHeaders();headers.set("Retry-After","120");f.server.expect(anything()).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).headers(headers));
    for(int i=0;i<2;i++)assertThatThrownBy(()->f.search.find("Giz","Legião Urbana")).isInstanceOfSatisfying(ResponseStatusException.class,e->{assertThat(e.getStatusCode().value()).isEqualTo(429);assertThat(Integer.parseInt(e.getHeaders().getFirst("Retry-After"))).isBetween(119,120);});f.server.verify();
  }
  @Test void malformedAndUnavailableResponsesAreNotReportedAsMissingLyrics(){
    for(boolean malformed:new boolean[]{true,false}){var f=fixture();f.server.expect(anything()).andRespond(malformed?withSuccess("{}",MediaType.APPLICATION_JSON):withStatus(HttpStatus.SERVICE_UNAVAILABLE));assertThatThrownBy(()->f.search.find("Giz","Artist")).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(503));}
  }

}
