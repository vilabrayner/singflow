package br.tec.flowave.singflow.catalog;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import br.tec.flowave.singflow.musicians.MusicianAccess;
import br.tec.flowave.singflow.requests.AssistedRequests;
import br.tec.flowave.singflow.sessions.SessionAccess;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;

@Testcontainers
@SpringBootTest(properties={"SINGFLOW_ENRICHMENT_ENABLED=false","SINGFLOW_LYRICS_PREFETCH_ENABLED=false","spring.application.name=singflow-streaming-tests","SINGFLOW_HOST_EMAIL=","SINGFLOW_HOST_PASSWORD=","LASTFM_API_KEY=","SINGFLOW_CATALOG_SYNC_ENABLED=false","SINGFLOW_SPOTIFY_SEARCH_ENABLED=false","SINGFLOW_YOUTUBE_SEARCH_ENABLED=false"})
@AutoConfigureMockMvc
class StreamingResourcesIntegrationTests {
  @Container @ServiceConnection static PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:17.6");
  @Autowired JdbcClient jdbc;@Autowired CatalogService catalog;@Autowired StreamingResources streaming;@Autowired MusicianAccess musicians;@Autowired SessionAccess sessions;@Autowired AssistedRequests requests;@Autowired MockMvc mvc;
  String admin,musician,host;UUID session,song;
  static final String URL="https://open.spotify.com/track/0123456789abcdefghijkl",OTHER="https://open.spotify.com/track/abcdefghijkl0123456789";
  String account(String role,boolean administrator){String email=UUID.randomUUID()+"@example.test";jdbc.sql("INSERT INTO singflow.host_accounts(email,password_hash,role,administrator) VALUES(?,'unused',?,?)").params(email,role,administrator).update();return email;}
  @BeforeEach void setup(){admin=account("HOST",true);host=account("HOST",false);musician=account("MUSICIAN",false);session=UUID.randomUUID();sessions.create(admin,"Café Tão",session);sessions.transition(session,admin,"OPEN");song=catalog.create(admin,UUID.randomUUID(),"Giz "+UUID.randomUUID(),"Legião Urbana").id();requests.register(session,admin,UUID.randomUUID(),"Ana",null,catalog.get(song).title(),"Legião Urbana");musicians.grant(session,admin,UUID.randomUUID(),musician);}
  @Test void savesOfficialReferenceAndExposesTypedLinkToAuthorizedMusician(){
    var link=streaming.save(admin,song,"spotify",0,URL+"?si=tracking");assertThat(link.url()).isEqualTo(URL);assertThat(link.icon()).isEqualTo("fa-spotify");assertThat(link.type()).isEqualTo("spotify");
    assertThat(musicians.performance(session,musician,false).streaming().get(song)).containsExactly(link);
    assertThat(jdbc.sql("SELECT count(*) FROM singflow.catalog_audit WHERE song_id=? AND action='STREAMING_LINKED'").param(song).query(Long.class).single()).isEqualTo(1);
    assertThat(catalog.get(song).status()).isEqualTo("APPROVED");
  }
  @Test void optimisticChangesAreIdempotentAndDoNotOverwriteOtherEditors(){
    streaming.save(admin,song,"spotify",0,URL);streaming.save(admin,song,"spotify",0,URL);
    assertThatThrownBy(()->streaming.save(admin,song,"spotify",0,OTHER)).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(409));
    assertThat(streaming.save(admin,song,"spotify",1,null).url()).isNull();assertThat(musicians.performance(session,musician,false).streaming()).doesNotContainKey(song);
  }
  @Test void enforcesAdminCsrfRevocationAndSupportedPlatforms() throws Exception {
    String path="/api/admin/catalog/songs/"+song+"/streaming/spotify";
    for(String actor:List.of(musician,host))mvc.perform(get(path).with(user(actor).roles(actor.equals(host)?"HOST":"MUSICIAN"))).andExpect(status().isForbidden());
    mvc.perform(post(path).with(user(admin).roles("ADMIN")).contentType("application/json").content("{\"version\":0,\"url\":\""+URL+"\"}")).andExpect(status().isForbidden());
    mvc.perform(post(path).with(user(admin).roles("ADMIN")).with(csrf()).contentType("application/json").content("{\"version\":0,\"url\":\"https://evil.test/track/a\"}")).andExpect(status().isBadRequest());
    mvc.perform(get(path+"/search?q=Giz").with(user(admin).roles("ADMIN"))).andExpect(status().isServiceUnavailable());
    mvc.perform(get(path.replace("spotify","deezer")).with(user(admin).roles("ADMIN"))).andExpect(status().isNotFound());
    musicians.revoke(session,admin,musician);assertThatThrownBy(()->musicians.performance(session,musician,false)).isInstanceOf(ResponseStatusException.class);
  }
  @Test void existingMergeTransfersReferenceToCanonicalSong(){
    streaming.save(admin,song,"spotify",0,URL);var target=catalog.create(admin,UUID.randomUUID(),"Destino "+UUID.randomUUID(),"Artist");catalog.merge(admin,song,1,target.id(),0,"Duplicata");
    assertThat(streaming.admin(admin,target.id(),"spotify").url()).isEqualTo(URL);assertThat(musicians.performance(session,musician,false).streaming()).containsKey(target.id()).doesNotContainKey(song);
  }
  @Test void concurrentChangesHaveOneWinner() throws Exception {
    try(var pool=Executors.newFixedThreadPool(2)){var a=pool.submit(()->save(URL));var b=pool.submit(()->save(OTHER));assertThat(List.of(a.get(10,TimeUnit.SECONDS),b.get(10,TimeUnit.SECONDS))).containsExactlyInAnyOrder(true,false);}
  }
  @Test void youtubeAndSpotifyReferencesCoexistAndFollowMergeAndRemoval() throws Exception {
    String video="https://www.youtube.com/watch?v=Abcde_12-XY";
    streaming.save(admin,song,"spotify",0,URL);
    var link=streaming.save(admin,song,"youtube",1,"https://youtu.be/Abcde_12-XY?si=tracking");
    assertThat(link.url()).isEqualTo(video);assertThat(link.icon()).isEqualTo("fa-youtube");
    assertThat(musicians.performance(session,musician,false).streaming().get(song)).extracting(StreamingResources.Link::type).containsExactlyInAnyOrder("spotify","youtube");
    var target=catalog.create(admin,UUID.randomUUID(),"Destino "+UUID.randomUUID(),"Artist");catalog.merge(admin,song,2,target.id(),0,"Duplicata");
    assertThat(streaming.admin(admin,target.id(),"youtube").url()).isEqualTo(video);
    var current=streaming.admin(admin,target.id(),"youtube");streaming.save(admin,target.id(),"youtube",current.version(),null);
    assertThat(musicians.performance(session,musician,false).streaming().get(target.id())).extracting(StreamingResources.Link::type).containsExactly("spotify");
  }
  @Test void youtubeWritesRequireAdminCsrfAndValidVideoUrl() throws Exception {
    String path="/api/admin/catalog/songs/"+song+"/streaming/youtube";
    mvc.perform(get(path).with(user(musician).roles("MUSICIAN"))).andExpect(status().isForbidden());
    mvc.perform(post(path).with(user(admin).roles("ADMIN")).contentType("application/json").content("{\"version\":0,\"url\":null}")).andExpect(status().isForbidden());
    mvc.perform(post(path).with(user(admin).roles("ADMIN")).with(csrf()).contentType("application/json").content("{\"version\":0,\"url\":\"https://evil.test/video\"}")).andExpect(status().isBadRequest());
    mvc.perform(get(path+"/search?q=Giz").with(user(admin).roles("ADMIN"))).andExpect(status().isServiceUnavailable());
  }
  boolean save(String url){try{streaming.save(admin,song,"spotify",0,url);return true;}catch(ResponseStatusException e){assertThat(e.getStatusCode().value()).isEqualTo(409);return false;}}
}
