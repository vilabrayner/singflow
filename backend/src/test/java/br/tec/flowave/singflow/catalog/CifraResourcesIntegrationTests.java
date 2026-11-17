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
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
@Testcontainers
@SpringBootTest(properties={"SINGFLOW_ENRICHMENT_ENABLED=false","SINGFLOW_LYRICS_PREFETCH_ENABLED=false","spring.application.name=singflow-cifra-tests","SINGFLOW_HOST_EMAIL=","SINGFLOW_HOST_PASSWORD=","LASTFM_API_KEY=","SINGFLOW_CATALOG_SYNC_ENABLED=false","SINGFLOW_CIFRA_SEARCH_ENABLED=false"})
@AutoConfigureMockMvc
class CifraResourcesIntegrationTests {
 @Container @ServiceConnection static PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:17.6");
 @Autowired JdbcClient jdbc;@Autowired CatalogService catalog;@Autowired CifraResources chords;@Autowired MusicianAccess musicians;@Autowired SessionAccess sessions;@Autowired AssistedRequests requests;@Autowired MockMvc mvc;
 String admin,one,two;UUID session,song;
 static final String OFFICIAL="https://www.cifraclub.com.br/legiao-urbana/giz/",PERSONAL="https://www.cifraclub.com.br/legiao-urbana/giz/simplificada.html";
 String account(String role,boolean administrator){String email=UUID.randomUUID()+"@example.test";jdbc.sql("INSERT INTO singflow.host_accounts(email,password_hash,role,administrator) VALUES(?,'unused',?,?)").params(email,role,administrator).update();return email;}
 @BeforeEach void setup(){
  admin=account("HOST",true);one=account("MUSICIAN",false);two=account("MUSICIAN",false);session=UUID.randomUUID();sessions.create(admin,"Café Tão",session);sessions.transition(session,admin,"OPEN");
  song=catalog.create(admin,UUID.randomUUID(),"Giz "+UUID.randomUUID(),"Legião Urbana").id();
  var p=requests.register(session,admin,UUID.randomUUID(),"Ana",null,catalog.get(song).title(),"Legião Urbana");
  musicians.grant(session,admin,UUID.randomUUID(),one);musicians.grant(session,admin,UUID.randomUUID(),two);
 }
 void conflict(Runnable action){assertThatThrownBy(action::run).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(409));}
 @Test void officialAndPersonalChoicesRemainSeparateAcrossSessionsAndResetIsIdempotent(){
  chords.official(admin,song,0,OFFICIAL);musicians.saveChord(session,one,song,0,PERSONAL);
  assertThat(chords.admin(admin,song).officialUrl()).isEqualTo(OFFICIAL);
  assertThat(musicians.chordContext(session,one,song).effectiveUrl()).isEqualTo(PERSONAL);
  assertThat(musicians.chordContext(session,two,song).effectiveUrl()).isEqualTo(OFFICIAL);
  UUID next=UUID.randomUUID();sessions.create(admin,"Outra",next);sessions.transition(next,admin,"OPEN");requests.register(next,admin,UUID.randomUUID(),"Ana",null,catalog.get(song).title(),"Legião Urbana");musicians.grant(next,admin,UUID.randomUUID(),one);
  assertThat(musicians.chordContext(next,one,song).personalUrl()).isEqualTo(PERSONAL);
  musicians.saveChord(next,one,song,1,null);musicians.saveChord(next,one,song,1,null);
  assertThat(musicians.chordContext(session,one,song).effectiveUrl()).isEqualTo(OFFICIAL);
  assertThat(jdbc.sql("SELECT count(*) FROM singflow.musician_chord_audit WHERE song_id=?").param(song).query(Long.class).single()).isEqualTo(2);
 }
 @Test void optimisticChangesDoNotOverwriteOtherEditorsOrOfficialReferences(){
  chords.official(admin,song,0,OFFICIAL);conflict(()->chords.official(admin,song,0,PERSONAL));
  musicians.saveChord(session,one,song,0,PERSONAL);conflict(()->musicians.saveChord(session,one,song,0,OFFICIAL));
  chords.official(admin,song,1,"https://www.cifraclub.com.br/legiao-urbana/giz/baixo.html");
  assertThat(musicians.chordContext(session,one,song).effectiveUrl()).isEqualTo(PERSONAL);
 }
 @Test void unificationTransfersPreferencesAndPreservesConflictsForTheMusician(){
  var target=catalog.create(admin,UUID.randomUUID(),"Destino "+UUID.randomUUID(),"Legião Urbana");
  var person=requests.register(session,admin,UUID.randomUUID(),"Bruno",null,target.title(),target.artist());
  musicians.saveChord(session,one,song,0,PERSONAL);musicians.saveChord(session,one,target.id(),0,OFFICIAL);
  musicians.saveChord(session,two,song,0,PERSONAL);
  catalog.merge(admin,song,0,target.id(),0,"Duplicata");
  var first=musicians.chordContext(session,one,target.id());assertThat(first.effectiveUrl()).isEqualTo(OFFICIAL);assertThat(first.alternatives()).contains(PERSONAL);
  assertThat(musicians.chordContext(session,two,target.id()).effectiveUrl()).isEqualTo(PERSONAL);
  assertThat(jdbc.sql("SELECT count(*) FROM singflow.catalog_songs WHERE id=?").param(song).query(Long.class).single()).isZero();
  musicians.saveChord(session,one,target.id(),first.personalVersion(),PERSONAL);
  assertThat(musicians.chordContext(session,one,target.id()).alternatives()).isEmpty();
  assertThat(jdbc.sql("SELECT count(*) FROM singflow.musician_chord_audit WHERE original_song_id=? AND song_id=?").params(song,target.id()).query(Long.class).single()).isEqualTo(2);
 }
 @Test void authorizationScopesWritesToTheActorAndVisibleSessionMusic() throws Exception {
  String path="/api/musicians/sessions/"+session+"/songs/"+song+"/chords";
  mvc.perform(post(path).with(user(one).roles("MUSICIAN")).contentType("application/json").content("{\"version\":0,\"url\":\""+PERSONAL+"\"}")).andExpect(status().isForbidden());
  mvc.perform(post("/api/admin/catalog/songs/"+song+"/chords").with(user(one).roles("MUSICIAN")).with(csrf()).contentType("application/json").content("{\"version\":0,\"url\":\""+PERSONAL+"\"}")).andExpect(status().isForbidden());
  var outside=catalog.create(admin,UUID.randomUUID(),"Outside "+UUID.randomUUID(),"Artist");
  assertThatThrownBy(()->musicians.saveChord(session,one,outside.id(),0,PERSONAL)).isInstanceOf(ResponseStatusException.class);
  musicians.revoke(session,admin,one);
  mvc.perform(get(path).with(user(one).roles("MUSICIAN"))).andExpect(status().isNotFound());
  assertThat(chords.get(song,two).personalUrl()).isNull();
 }
 @Test void invalidUrlsAndDisabledSearchNeverCreatePreferences() throws Exception {
  String path="/api/musicians/sessions/"+session+"/songs/"+song+"/chords";
  mvc.perform(post(path).with(user(one).roles("MUSICIAN")).with(csrf()).contentType("application/json").content("{\"version\":0,\"url\":\"https://evil.test/a/b/\"}")).andExpect(status().isBadRequest());
  mvc.perform(get(path+"/search?q=Giz").with(user(one).roles("MUSICIAN"))).andExpect(status().isServiceUnavailable());
  assertThat(chords.get(song,one).personalUrl()).isNull();
  mvc.perform(post(path).with(user(one).roles("MUSICIAN")).with(csrf()).contentType("application/json").content("{\"version\":0,\"url\":\""+PERSONAL+"\"}")).andExpect(status().isOk());
 }
 @Test void concurrentFirstPersonalChoicesHaveOneWinner() throws Exception {
  try(var pool=Executors.newFixedThreadPool(2)){
   var a=pool.submit(()->save(OFFICIAL));var b=pool.submit(()->save(PERSONAL));
   assertThat(List.of(a.get(10,TimeUnit.SECONDS),b.get(10,TimeUnit.SECONDS))).containsExactlyInAnyOrder(true,false);
  }
 }
 boolean save(String url){try{musicians.saveChord(session,one,song,0,url);return true;}catch(ResponseStatusException e){assertThat(e.getStatusCode().value()).isEqualTo(409);return false;}}
}
