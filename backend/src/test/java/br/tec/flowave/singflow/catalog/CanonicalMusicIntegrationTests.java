package br.tec.flowave.singflow.catalog;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
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
import br.tec.flowave.singflow.requests.AssistedRequests;
import br.tec.flowave.singflow.sessions.SessionAccess;
import br.tec.flowave.singflow.stage.StageService;
import br.tec.flowave.singflow.musicians.MusicianAccess;

@Testcontainers
@SpringBootTest(properties={"SINGFLOW_ENRICHMENT_ENABLED=false","SINGFLOW_LYRICS_PREFETCH_ENABLED=false","spring.application.name=singflow-canonical-tests","SINGFLOW_HOST_EMAIL=","SINGFLOW_HOST_PASSWORD=","LASTFM_API_KEY=","SINGFLOW_CATALOG_SYNC_ENABLED=false"})
@AutoConfigureMockMvc
class CanonicalMusicIntegrationTests {
 @Container @ServiceConnection static PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:17.6");
 @Autowired JdbcClient jdbc;
 @Autowired CatalogService catalog;
 @Autowired CatalogDetails details;
 @Autowired CatalogSync sync;
 @Autowired AssistedRequests requests;
 @Autowired SessionAccess sessions;
 @Autowired StageService stage;
 @Autowired MusicianAccess musicians;
 @Autowired MockMvc mvc;
 String admin; UUID session;
 @BeforeEach void setup() {
  admin=UUID.randomUUID()+"@example.test";
  jdbc.sql("INSERT INTO singflow.host_accounts(email,password_hash,administrator) VALUES(?,'unused',true)").param(admin).update();
  session=UUID.randomUUID();sessions.create(admin,"Ensaio",session);sessions.transition(session,admin,"OPEN");
 }
 AssistedRequests.Registration participant(String title) {return requests.register(session,admin,UUID.randomUUID(),"Ana",null,title,"Artista");}
 StageService.CallView call() {
  var next=stage.snapshot(session,admin).suggestions().getFirst();
  return stage.confirm(session,admin,UUID.randomUUID(),next.participantId(),next.requestId(),null,null).active();
 }
 void conflict(Runnable task) {assertThatThrownBy(task::run).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(409));}
 @Test void completeSongDraftIsAtomicAndPreservesUnvisitedReferences() throws Exception {
  var song=catalog.create(admin,UUID.randomUUID(),"Unified "+UUID.randomUUID(),"Artist");
  var refs=new LinkedHashMap<String,String>();
  refs.put("cifra","https://www.cifraclub.com.br/legiao-urbana/giz/");
  refs.put("spotify","https://open.spotify.com/track/0123456789abcdefghijkl");
  refs.put("youtube","https://www.youtube.com/watch?v=Abcde_12-XY");
  String payload=new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(Map.of("version",song.version(),"title",song.title(),"artist","Legião Urbana","originalKey","D","references",refs));
  mvc.perform(post("/api/admin/catalog/songs/"+song.id()+"/details").with(user(admin).roles("HOST")).with(csrf()).contentType("application/json").content(payload))
      .andExpect(status().isOk()).andExpect(jsonPath("$.originalKey").value("D"));
  var saved=catalog.get(song.id());
  for(var entry:Map.of("cifra","chords_url","spotify","spotify_url","youtube","youtube_url").entrySet())
    assertThat(jdbc.sql("SELECT "+entry.getValue()+" FROM singflow.catalog_songs WHERE id=?").param(song.id()).query(String.class).single()).isEqualTo(refs.get(entry.getKey()));
  var unchanged=details.save(admin,song.id(),saved.version(),saved.title(),saved.artist(),"D",Map.of());
  assertThat(unchanged.version()).isEqualTo(saved.version());
  details.save(admin,song.id(),saved.version(),saved.title(),saved.artist(),"D",Map.of("cifra",""));
  assertThat(jdbc.sql("SELECT chords_url IS NULL FROM singflow.catalog_songs WHERE id=?").param(song.id()).query(Boolean.class).single()).isTrue();
  assertThat(jdbc.sql("SELECT spotify_url FROM singflow.catalog_songs WHERE id=?").param(song.id()).query(String.class).single()).isEqualTo(refs.get("spotify"));
 }
 @Test void completeEditorReadIncludesReferencesAndRequiresAdmin() throws Exception {
  var song=catalog.create(admin,UUID.randomUUID(),"Editor "+UUID.randomUUID(),"Artist");
  var refs=Map.of("cifra","https://www.cifraclub.com.br/legiao-urbana/giz/",
      "spotify","https://open.spotify.com/track/0123456789abcdefghijkl",
      "youtube","https://www.youtube.com/watch?v=Abcde_12-XY");
  var saved=details.save(admin,song.id(),song.version(),song.title(),song.artist(),"Bm",refs);
  String path="/api/admin/catalog/songs/"+song.id()+"/details";
  mvc.perform(get(path).with(user(admin).roles("HOST")))
      .andExpect(status().isOk()).andExpect(jsonPath("$.song.id").value(song.id().toString()))
      .andExpect(jsonPath("$.song.originalKey").value("Bm"))
      .andExpect(jsonPath("$.song.version").value((int)saved.version()))
      .andExpect(jsonPath("$.chord.officialUrl").value(refs.get("cifra")))
      .andExpect(jsonPath("$.chord.version").value((int)saved.version()))
      .andExpect(jsonPath("$.streaming[?(@.type == 'spotify')].url").value(org.hamcrest.Matchers.contains(refs.get("spotify"))))
      .andExpect(jsonPath("$.streaming[?(@.type == 'youtube')].url").value(org.hamcrest.Matchers.contains(refs.get("youtube"))));
  assertThat(details.load(admin,song.id()).streaming()).allSatisfy(link->assertThat(link.version()).isEqualTo(saved.version()));
  assertThat(catalog.get(song.id())).isEqualTo(saved);
  String other=UUID.randomUUID()+"@example.test";
  jdbc.sql("INSERT INTO singflow.host_accounts(email,password_hash) VALUES(?,'unused')").param(other).update();
  mvc.perform(get(path).with(user(other).roles("HOST"))).andExpect(status().isForbidden());
  mvc.perform(get(path)).andExpect(status().isUnauthorized());
  var empty=catalog.create(admin,UUID.randomUUID(),"Empty editor "+UUID.randomUUID(),"");
  var view=details.load(admin,empty.id());
  assertThat(view.chord().officialUrl()).isNull();
  assertThat(view.streaming()).allSatisfy(link->assertThat(link.url()).isNull());
  catalog.delete(admin,empty.id(),empty.version());
  mvc.perform(get("/api/admin/catalog/songs/"+empty.id()+"/details").with(user(admin).roles("HOST"))).andExpect(status().isNotFound());
 }
 @Test void completeSongDraftRollsBackAllFieldsAndAuditWhenAnyLinkIsInvalid() {
  var song=catalog.create(admin,UUID.randomUUID(),"Rollback "+UUID.randomUUID(),"Artist");
  int audit=catalog.history(admin,song.id()).size();
  var refs=new LinkedHashMap<String,String>();
  refs.put("cifra","https://www.cifraclub.com.br/legiao-urbana/giz/");refs.put("youtube","https://evil.test/watch?v=Abcde_12-XY");
  assertThatThrownBy(()->details.save(admin,song.id(),song.version(),song.title()+" edited","Other","C",refs)).isInstanceOf(ResponseStatusException.class);
  assertThat(catalog.get(song.id())).isEqualTo(song);
  assertThat(catalog.history(admin,song.id())).hasSize(audit);
  assertThat(jdbc.sql("SELECT chords_url IS NULL FROM singflow.catalog_songs WHERE id=?").param(song.id()).query(Boolean.class).single()).isTrue();
 }
 @Test void completeSongDraftRejectsStaleVersionsAndRequiresAdminAndCsrf() throws Exception {
  var song=catalog.create(admin,UUID.randomUUID(),"Permissions "+UUID.randomUUID(),"Artist");
  catalog.setOriginalKey(admin,song.id(),song.version(),"D");
  conflict(()->details.save(admin,song.id(),song.version(),song.title(),song.artist(),"C",Map.of()));
  String path="/api/admin/catalog/songs/"+song.id()+"/details";
  String body=new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(Map.of("version",1,"title",song.title(),"artist",song.artist(),"originalKey","C","references",Map.of()));
  mvc.perform(post(path).with(user(admin).roles("HOST")).contentType("application/json").content(body)).andExpect(status().isForbidden());
  String other=UUID.randomUUID()+"@example.test";jdbc.sql("INSERT INTO singflow.host_accounts(email,password_hash) VALUES(?,'unused')").param(other).update();
  mvc.perform(post(path).with(user(other).roles("HOST")).with(csrf()).contentType("application/json").content(body)).andExpect(status().isForbidden());
  assertThat(catalog.get(song.id()).originalKey()).isEqualTo("D");
 }
 @Test void keyOnlyEditRemainsVisibleInAdminSearchAndCanBeCleared() throws Exception {
  var song=catalog.create(admin,UUID.randomUUID(),"Key regression "+UUID.randomUUID(),"Artist");
  String path="/api/admin/catalog/songs/"+song.id();
  var json=new com.fasterxml.jackson.databind.ObjectMapper();
  mvc.perform(post(path).with(user(admin).roles("HOST")).with(csrf())
      .contentType("application/json").content(json.writeValueAsString(Map.of(
          "version",song.version(),"title",song.title(),"artist",song.artist(),"originalKey","Bm"))))
      .andExpect(status().isOk()).andExpect(jsonPath("$.originalKey").value("Bm"));
  var saved=catalog.get(song.id());
  assertThat(saved.originalKey()).isEqualTo("Bm");
  assertThat(saved.title()).isEqualTo(song.title());
  assertThat(saved.artist()).isEqualTo(song.artist());
  mvc.perform(get("/api/admin/catalog/songs/search-page").with(user(admin).roles("HOST"))
      .param("q",song.title())).andExpect(status().isOk())
      .andExpect(jsonPath("$.items[0].originalKey").value("Bm"))
      .andExpect(jsonPath("$.items[0].version").value(saved.version()));
  mvc.perform(post(path).with(user(admin).roles("HOST")).with(csrf())
      .contentType("application/json").content(json.writeValueAsString(Map.of(
          "version",saved.version(),"title",song.title(),"artist",song.artist(),"originalKey",""))))
      .andExpect(status().isOk());
  assertThat(catalog.get(song.id()).originalKey()).isNull();
 }
 @Test void correctionsAndPhysicalConsolidationKeepEveryReferenceAndRetry() {
  var p=participant("Gis "+UUID.randomUUID()); UUID source=p.request().catalogSongId();
  var live=call();stage.resolve(session,admin,live.id(),"COMPLETED");
  var edited=catalog.edit(admin,source,0,"Giz "+UUID.randomUUID(),"Legião Urbana");
  assertThat(requests.list(session,admin).getFirst().title()).isEqualTo(edited.title());
  assertThat(stage.snapshot(session,admin).history().getFirst().title()).isEqualTo(edited.title());
  var target=catalog.createWithKey(admin,UUID.randomUUID(),"Giz oficial "+UUID.randomUUID(),"Legião Urbana","D");
  sync.start(admin,UUID.randomUUID());
  catalog.merge(admin,source,edited.version(),target.id(),target.version(),"Mesmo cadastro");
  assertThat(jdbc.sql("SELECT count(*) FROM singflow.catalog_songs WHERE id=?").param(source).query(Long.class).single()).isZero();
  assertThat(jdbc.sql("SELECT catalog_song_id FROM singflow.song_requests WHERE id=?").param(p.request().id()).query(UUID.class).single()).isEqualTo(target.id());
  assertThat(jdbc.sql("SELECT catalog_song_id FROM singflow.stage_calls WHERE id=?").param(live.id()).query(UUID.class).single()).isEqualTo(target.id());
  assertThat(jdbc.sql("SELECT song_id FROM singflow.catalog_sync_items WHERE original_song_id=?").param(source).query(UUID.class).single()).isEqualTo(target.id());
  assertThat(catalog.alias(p.request().title(),"Artista")).contains(target.id());
  assertThat(catalog.history(admin,target.id())).extracting(CatalogService.Event::action).contains("MERGED","ABSORBED");
  assertThat(requests.add(session,admin,p.participant().id(),p.request().id(),p.request().title(),"Artista").catalogSongId()).isEqualTo(target.id());
  assertThat(stage.snapshot(session,admin).history().getFirst().title()).isEqualTo(target.title());
  assertThat(catalog.list(admin,"","MERGED",0).items()).isEmpty();
  var finalSong=catalog.create(admin,UUID.randomUUID(),"Definitiva "+UUID.randomUUID(),"Artista");
  catalog.merge(admin,target.id(),catalog.get(target.id()).version(),finalSong.id(),0,"Consolidar cadeia");
  assertThat(catalog.alias(p.request().title(),"Artista")).contains(finalSong.id());
  assertThat(jdbc.sql("SELECT target_id FROM singflow.catalog_redirects WHERE source_id=?").param(source).query(UUID.class).single()).isEqualTo(finalSong.id());
 }
 @Test void requestSettingsAreOptimisticResetOnReplacementAndFreezeAtCall() {
  var p=participant("Tom "+UUID.randomUUID());var request=p.request();
  requests.configureSelf(session,admin,p.participant().id(),request.id(),0,request.catalogSongId(),-2);
  requests.configureSelf(session,admin,p.participant().id(),request.id(),0,request.catalogSongId(),-2);
  conflict(()->requests.configureSelf(session,admin,p.participant().id(),request.id(),0,request.catalogSongId(),1));
  assertThat(requests.list(session,admin).getFirst().keyLabel()).isEqualTo("-2");
  catalog.setOriginalKey(admin,request.catalogSongId(),0,"D");
  assertThat(requests.list(session,admin).getFirst().keyLabel()).isEqualTo("C");
  var called=call();assertThat(called.keyLabel()).isEqualTo("C");assertThat(called.semitones()).isEqualTo(-2);
  conflict(()->requests.configureSelf(session,admin,p.participant().id(),request.id(),1,request.catalogSongId(),1));
  stage.resolve(session,admin,called.id(),"COMPLETED");
  var next=requests.add(session,admin,p.participant().id(),UUID.randomUUID(),"Outra "+UUID.randomUUID(),null);
  requests.configureSelf(session,admin,p.participant().id(),next.id(),0,next.catalogSongId(),2);
  requests.editSelf(session,admin,p.participant().id(),next.id(),next.title(),next.artist(),"Troca "+UUID.randomUUID(),null,null);
  assertThat(requests.list(session,admin).stream().filter(x->x.id().equals(next.id())).findFirst().orElseThrow().semitones()).isZero();
 }
 @Test void onlyGrantedMusiciansCanRecordActualKeyAndConflictingEditsAreRejected() throws Exception {
  var p=participant("Palco "+UUID.randomUUID());var live=call();
  String musician=UUID.randomUUID()+"@example.test";
  jdbc.sql("INSERT INTO singflow.host_accounts(email,password_hash,role,display_name) VALUES(?,'unused','MUSICIAN','Músico')").param(musician).update();
  String path="/api/musicians/sessions/"+session+"/calls/"+live.id()+"/key";
  mvc.perform(post(path).with(user(musician).roles("MUSICIAN")).with(csrf()).contentType("application/json").content("{\"version\":0,\"performedKey\":\"C\"}")).andExpect(status().isNotFound());
  musicians.grant(session,admin,UUID.randomUUID(),musician);
  mvc.perform(post(path).with(user(musician).roles("MUSICIAN")).contentType("application/json").content("{\"version\":0,\"performedKey\":\"C\"}")).andExpect(status().isForbidden());
  musicians.recordKey(session,musician,live.id(),0,"C");
  musicians.recordKey(session,musician,live.id(),0,"C");
  conflict(()->musicians.recordKey(session,musician,live.id(),0,"D"));
  assertThat(stage.snapshot(session,admin).active().performedKey()).isEqualTo("C");
  assertThat(catalog.get(p.request().catalogSongId()).originalKey()).isNull();
  stage.resolve(session,admin,live.id(),"COMPLETED");
  musicians.recordKey(session,musician,live.id(),1,"Am");
  assertThat(stage.snapshot(session,admin).history().getFirst().performedKey()).isEqualTo("Am");
  musicians.revoke(session,admin,musician);
  assertThatThrownBy(()->musicians.recordKey(session,musician,live.id(),2,"D")).isInstanceOf(ResponseStatusException.class);
 }
 @Test void concurrentMergeAndConfigurationRemainConsistent() throws Exception {
  var p=participant("Concurrent "+UUID.randomUUID());var source=p.request().catalogSongId();
  var target=catalog.create(admin,UUID.randomUUID(),"Target "+UUID.randomUUID(),"Artista");
  try(var pool=Executors.newFixedThreadPool(2)) {
   var merge=pool.submit(()->catalog.merge(admin,source,0,target.id(),0,"Duplicata"));
   var configure=pool.submit(()->{try{requests.configureSelf(session,admin,p.participant().id(),p.request().id(),0,source,2);}catch(ResponseStatusException e){assertThat(e.getStatusCode().value()).isEqualTo(409);}});
   merge.get(10,TimeUnit.SECONDS);configure.get(10,TimeUnit.SECONDS);
  }
  var saved=requests.list(session,admin).getFirst();assertThat(saved.catalogSongId()).isEqualTo(target.id());
  assertThat(saved.semitones()).isIn(0,2);
 }
 @Test void upgradesV18WithExistingMergeChainsAndCollidingSyncReferences() throws Exception {
  String database="music_upgrade_"+UUID.randomUUID().toString().replace("-","");
  String url=postgres.getJdbcUrl().replace("/"+postgres.getDatabaseName(),"/"+database);
  try(var c=java.sql.DriverManager.getConnection(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword());var q=c.createStatement()) {q.execute("CREATE DATABASE "+database);}
  UUID target=UUID.randomUUID(),middle=UUID.randomUUID(),source=UUID.randomUUID(),run=UUID.randomUUID(),person=UUID.randomUUID(),eventSession=UUID.randomUUID();
  try {
   org.flywaydb.core.Flyway.configure().dataSource(url,postgres.getUsername(),postgres.getPassword()).target("18").load().migrate();
   try(var c=java.sql.DriverManager.getConnection(url,postgres.getUsername(),postgres.getPassword());var q=c.createStatement()) {
    q.execute("INSERT INTO singflow.host_accounts(email,password_hash) VALUES('upgrade@example.test','unused')");
    q.execute("INSERT INTO singflow.sessions(id,owner,name,status,created_at) VALUES('"+eventSession+"','upgrade@example.test','Legacy','CLOSED',now())");
    q.execute("INSERT INTO singflow.participants(id,session_id,name,status,origin,checked_in_at,queue_joined_at) VALUES('"+person+"','"+eventSession+"','Ana','LEFT','ASSISTED',now(),now())");
    q.execute("INSERT INTO singflow.catalog_songs(id,title,artist,status,source) VALUES('"+target+"','Giz','Legião Urbana','APPROVED','ADMIN')");
    q.execute("INSERT INTO singflow.catalog_songs(id,title,artist,status,source,merged_into) VALUES('"+middle+"','Gis','Legiao','MERGED','REQUEST','"+target+"'),('"+source+"','gis antiga','','MERGED','REQUEST','"+middle+"')");
    q.execute("INSERT INTO singflow.catalog_aliases VALUES('gis antiga','','"+source+"')");
    q.execute("INSERT INTO singflow.catalog_audit VALUES(gen_random_uuid(),'"+source+"','upgrade@example.test','MERGED','Antes da V19',NULL,jsonb_build_object('id','"+source+"','title','gis antiga'),now())");
    q.execute("INSERT INTO singflow.song_requests(id,session_id,participant_id,title,artist,status,created_at,catalog_song_id) VALUES(gen_random_uuid(),'"+eventSession+"','"+person+"','gis antiga',NULL,'COMPLETED',now(),'"+source+"')");
    q.execute("INSERT INTO singflow.stage_calls(id,session_id,participant_id,title,status,created_at,resolved_at,resolution_order,catalog_song_id) VALUES(gen_random_uuid(),'"+eventSession+"','"+person+"','gis antiga','COMPLETED',now(),now(),nextval('singflow.stage_resolution_order_seq'),'"+source+"')");
    q.execute("INSERT INTO singflow.catalog_sync_runs(id,status,started_by,runner) VALUES('"+run+"','COMPLETED','upgrade@example.test','upgrade@example.test')");
    q.execute("INSERT INTO singflow.catalog_sync_items(id,run_id,song_id,title,artist,song_version,state) VALUES(gen_random_uuid(),'"+run+"','"+source+"','gis antiga','',0,'MERGED'),(gen_random_uuid(),'"+run+"','"+target+"','Giz','Legião Urbana',0,'APPROVED')");
    q.execute("INSERT INTO singflow.catalog_import_operations VALUES(gen_random_uuid(),'upgrade@example.test','"+source+"','gis antiga','Artista',gen_random_uuid())");
   }
   var upgraded=org.flywaydb.core.Flyway.configure().dataSource(url,postgres.getUsername(),postgres.getPassword()).load();upgraded.migrate();
   assertThat(upgraded.validateWithResult().validationSuccessful).isTrue();
   try(var c=java.sql.DriverManager.getConnection(url,postgres.getUsername(),postgres.getPassword());var q=c.createStatement()) {
    try(var rows=q.executeQuery("SELECT count(*) FROM singflow.catalog_songs")){rows.next();assertThat(rows.getLong(1)).isEqualTo(1);}
    try(var rows=q.executeQuery("SELECT count(*) FROM singflow.catalog_sync_items WHERE song_id='"+target+"'")){rows.next();assertThat(rows.getLong(1)).isEqualTo(2);}
    try(var rows=q.executeQuery("SELECT song_id,original_song_id FROM singflow.catalog_audit")){rows.next();assertThat(rows.getObject(1,UUID.class)).isEqualTo(target);assertThat(rows.getObject(2,UUID.class)).isEqualTo(source);}
    try(var rows=q.executeQuery("SELECT r.catalog_song_id,c.catalog_song_id,r.creation_fingerprint FROM singflow.song_requests r CROSS JOIN singflow.stage_calls c")){rows.next();assertThat(rows.getObject(1,UUID.class)).isEqualTo(target);assertThat(rows.getObject(2,UUID.class)).isEqualTo(target);assertThat(rows.getString(3)).isEqualTo(MusicKey.fingerprint("gis antiga",null));}
    try(var rows=q.executeQuery("SELECT count(*) FROM information_schema.columns WHERE table_schema='singflow' AND table_name IN ('song_requests','stage_calls') AND column_name IN ('title','artist')")){rows.next();assertThat(rows.getInt(1)).isZero();}
    try(var rows=q.executeQuery("SELECT singflow.catalog_root('"+source+"'::uuid)")){rows.next();assertThat(rows.getObject(1,UUID.class)).isEqualTo(target);}
   }
  } finally {
   try(var c=java.sql.DriverManager.getConnection(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword());var q=c.createStatement()) {q.execute("DROP DATABASE "+database+" WITH (FORCE)");}
  }
 }

}
