package br.tec.flowave.singflow.catalog;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;
class CifraSearchTests {
 static final String SONG="{\"id\":\"cm_3283\",\"type\":\"song\",\"name\":\"Giz\",\"slug\":\"giz\",\"artist\":{\"name\":\"Legião Urbana\",\"slug\":\"legiao-urbana\"},\"verified\":true}";
 @Test void prioritizesTopResultDeduplicatesAndFiltersNonSongsWithoutTrustingUrls(){
  var builder=RestClient.builder();var server=MockRestServiceServer.bindTo(builder).build();
  server.expect(requestTo(org.hamcrest.Matchers.containsString("type=all"))).andRespond(withSuccess("{\"top_result\":"+SONG+"}",MediaType.APPLICATION_JSON));
  server.expect(requestTo(org.hamcrest.Matchers.containsString("type=songs"))).andRespond(withSuccess("{\"results\":["+SONG+",{\"type\":\"artist\",\"name\":\"Other\"},{\"type\":\"song\",\"name\":\"Attack\",\"slug\":\"../../bad\",\"artist\":{\"name\":\"Artist\",\"slug\":\"artist\"}}],\"page\":1,\"total_pages\":2}",MediaType.APPLICATION_JSON));
  var search=new CifraSearch(builder.build(),true);var result=search.search("Giz Legião Urbana",1);
  assertThat(result.items()).hasSize(1);var song=result.items().getFirst();
  assertThat(song.url()).isEqualTo("https://www.cifraclub.com.br/legiao-urbana/giz/");assertThat(song.recommended()).isTrue();assertThat(result.hasMore()).isTrue();
  assertThat(search.search("Giz Legião Urbana",1)).isEqualTo(result);server.verify();
 }
 @Test void subsequentPagesDoNotRequestTopResult(){
  var builder=RestClient.builder();var server=MockRestServiceServer.bindTo(builder).build();
  server.expect(requestTo(org.hamcrest.Matchers.containsString("_page=2"))).andRespond(withSuccess("{\"results\":[],\"page\":2,\"total_pages\":2}",MediaType.APPLICATION_JSON));
  assertThat(new CifraSearch(builder.build(),true).search("Giz",2).hasMore()).isFalse();server.verify();
 }
 @Test void shortDisabledAndInvalidQueriesDoNotLeakToProvider(){
  var search=new CifraSearch(RestClient.create(),false);
  assertThat(search.search("ab",1).items()).isEmpty();
  assertThatThrownBy(()->search.search("Giz",1)).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(503));
  assertThatThrownBy(()->search.search("Giz",0)).isInstanceOf(ResponseStatusException.class);
 }
 @Test void providerFailuresAreNotReportedAsNoMatches(){
  var builder=RestClient.builder();var server=MockRestServiceServer.bindTo(builder).build();
  server.expect(anything()).andRespond(withStatus(HttpStatus.FORBIDDEN));
  assertThatThrownBy(()->new CifraSearch(builder.build(),true).search("Giz",1)).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(503));server.verify();
 }
 @Test void refusesUnsafeLinksAndPreservesValidVersions(){
  for(String url:new String[]{"javascript:alert(1)","http://www.cifraclub.com.br/a/b/","https://evil.test/a/b/","https://www.cifraclub.com.br.evil.test/a/b/","https://user@www.cifraclub.com.br/a/b/","https://www.cifraclub.com.br:444/a/b/","https://www.cifraclub.com.br/blog/post/","https://www.cifraclub.com.br/a/%2e%2e/","https://www.cifraclub.com.br/a/b/../../redirect"}) assertThatThrownBy(()->CifraSearch.safeUrl(url)).isInstanceOf(ResponseStatusException.class);
  assertThat(CifraSearch.safeUrl("https://cifraclub.com.br/legiao-urbana/giz/simplificada.html?tom=1#x")).isEqualTo("https://www.cifraclub.com.br/legiao-urbana/giz/simplificada.html?tom=1");
  assertThat(CifraSearch.safeUrl("https://www.cifraclub.com.br/diante-do-trono/me-ama-/")).isNotNull();
 }
}
