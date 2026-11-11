package br.tec.flowave.singflow.catalog;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

class SongSearchTests {
  @Test
  void shortQueriesNeverReachProvider() {
    var service = new SongSearch(RestClient.create(), "");
    assertThat(service.search(" ab ")).isEmpty();
    assertThatThrownBy(() -> service.search("abc"))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageNotContaining("api_key");
  }

  @Test
  void encodesQueryLimitsDeduplicatesAndCachesResults() {
    var builder = RestClient.builder().baseUrl("https://example.test/");
    var server = MockRestServiceServer.bindTo(builder).build();
    server
        .expect(queryParam("track", "A%20%26%20B"))
        .andExpect(queryParam("limit", "10"))
        .andRespond(
            withSuccess(
                """
                {"results":{"trackmatches":{"track":[
                {"name":"Song","artist":"Artist"},{"name":"Song","artist":"Artist"},
                {"name":" ","artist":"Invalid"}]}}}
                """,
                MediaType.APPLICATION_JSON));
    var service = new SongSearch(builder.build(), "test-key");
    assertThat(service.search(" A & B ")).containsExactly(new SongSearch.Song("Song", "Artist"));
    assertThat(service.search("a & b")).hasSize(1);
    server.verify();
  }

  @Test
  void providerErrorsAreSanitizedAndNotCached() {
    var builder = RestClient.builder().baseUrl("https://example.test/");
    var server = MockRestServiceServer.bindTo(builder).build();
    server
        .expect(anything())
        .andRespond(
            withSuccess(
                "{\"error\":6,\"message\":\"secret-provider-detail\"}",
                MediaType.APPLICATION_JSON));
    server
        .expect(anything())
        .andRespond(
            withSuccess(
                "{\"results\":{\"trackmatches\":{\"track\":[]}}}", MediaType.APPLICATION_JSON));
    var service = new SongSearch(builder.build(), "test-key");
    assertThatThrownBy(() -> service.search("abc"))
        .isInstanceOf(ResponseStatusException.class)
        .hasMessageNotContaining("secret-provider-detail")
        .hasMessageNotContaining("test-key");
    assertThat(service.search("abc")).isEmpty();
    server.verify();
  }

  @Test
  void capsUntrustedProviderResponseAtTenSongs() {
    var builder = RestClient.builder().baseUrl("https://example.test/");
    var server = MockRestServiceServer.bindTo(builder).build();
    String tracks =
        java.util.stream.IntStream.range(0, 15)
            .mapToObj(i -> "{\"name\":\"Song " + i + "\",\"artist\":\"Artist\"}")
            .collect(java.util.stream.Collectors.joining(","));
    server
        .expect(anything())
        .andRespond(
            withSuccess(
                "{\"results\":{\"trackmatches\":{\"track\":[" + tracks + "]}}}",
                MediaType.APPLICATION_JSON));
    assertThat(new SongSearch(builder.build(), "test-key").search("abc")).hasSize(10);
    server.verify();
  }
}
