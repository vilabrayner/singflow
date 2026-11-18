package br.tec.flowave.singflow.catalog;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import br.tec.flowave.singflow.requests.AssistedRequests;
import br.tec.flowave.singflow.sessions.SessionAccess;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;

@Testcontainers
@SpringBootTest(properties={"spring.application.name=singflow-enrichment-tests","SINGFLOW_HOST_EMAIL=","SINGFLOW_HOST_PASSWORD=","LASTFM_API_KEY=","SINGFLOW_CATALOG_SYNC_ENABLED=false","SINGFLOW_LYRICS_PREFETCH_ENABLED=false","SINGFLOW_ENRICHMENT_ENABLED=true","SINGFLOW_ENRICHMENT_WORKER_ENABLED=false"})
@AutoConfigureMockMvc
class CatalogEnrichmentIntegrationTests {
 @Container @ServiceConnection static PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:17.6");
 @Autowired JdbcClient jdbc;@Autowired CatalogService catalog;@Autowired CatalogEnrichment queue;@Autowired AssistedRequests requests;@Autowired SessionAccess sessions;@Autowired StreamingResources streaming;@Autowired CifraResources chords;@Autowired MockMvc mvc;@Autowired PlatformTransactionManager transactions;
 String admin,musician;UUID session;
 static final String SPOTIFY="https://open.spotify.com/track/0123456789abcdefghijkl",CIFRA="https://www.cifraclub.com.br/legiao-urbana/giz/";
 @BeforeEach void setup(){jdbc.sql("DELETE FROM singflow.catalog_enrichment_jobs").update();admin=UUID.randomUUID()+"@example.test";jdbc.sql("INSERT INTO singflow.host_accounts(email,password_hash,administrator) VALUES(?,'unused',true)").param(admin).update();musician=UUID.randomUUID()+"@example.test";jdbc.sql("INSERT INTO singflow.host_accounts(email,password_hash,role) VALUES(?,'unused','MUSICIAN')").param(musician).update();session=UUID.randomUUID();sessions.create(admin,"Teste",session);sessions.transition(session,admin,"OPEN");}
 UUID add(String artist){return requests.register(session,admin,UUID.randomUUID(),"Ana",null,"Song "+UUID.randomUUID(),artist).request().catalogSongId();}
 long jobs(){return jdbc.sql("SELECT count(*) FROM singflow.catalog_enrichment_jobs").query(Long.class).single();}
 CatalogEnrichment.Claim claim(String provider){for(int i=0;i<8;i++){var next=queue.claim();if(next.isEmpty())continue;var claim=next.get();if(claim.provider().equals(provider))return claim;queue.complete(claim,List.of());}throw new AssertionError("No claim for "+provider);}
 CatalogEnrichment.Candidate candidate(String provider){return new CatalogEnrichment.Candidate(provider,"id","Found","Artist","",0,provider.equals("cifra")?CIFRA:SPOTIFY,true);}
 @Test void newRequestSchedulesOnceAndRollbackLeavesNoJobs(){
  UUID operation=UUID.randomUUID();String title="New "+UUID.randomUUID();var first=requests.register(session,admin,operation,"Ana",null,title,"Artist");assertThat(jobs()).isEqualTo(4);
  requests.register(session,admin,operation,"Ana",null,title,"Artist");requests.register(session,admin,UUID.randomUUID(),"Bruno",null,title,"Artist");assertThat(jobs()).isEqualTo(4);
  new TransactionTemplate(transactions).execute(status->{add("Artist");status.setRollbackOnly();return null;});assertThat(jobs()).isEqualTo(4);
  assertThat(jdbc.sql("SELECT status FROM singflow.song_requests WHERE id=?").param(first.request().id()).query(String.class).single()).isEqualTo("PENDING");
 }
 @Test void workerPersistsLinkSuggestionsButNotLyricsOrOfficialReferences(){
  UUID song=add("Artist");var lyrics=mock(LyricsSessionCache.class);when(lyrics.findForSong(any(),anyString(),anyString())).thenReturn(new LyricsSearch.Result("FOUND","LRCLIB","Found","Artist","Texto sintético",null));
  var cifra=mock(CifraSearch.class);when(cifra.search(anyString(),eq(1))).thenReturn(new CifraSearch.Page(List.of(new CifraSearch.Match("id","Found","Artist",CIFRA,true,true)),1,false));
  var providers=new ArrayList<StreamingSearch>();for(String type:List.of("spotify","youtube")){var provider=mock(StreamingSearch.class);var metadata=new StreamingSearch.Provider(type,type,"fa-"+type);when(provider.provider()).thenReturn(metadata);when(provider.search(anyString(),eq(1))).thenReturn(new StreamingSearch.Page(metadata,List.of(new StreamingSearch.Track(type,"id","Found","Artist","",0,type.equals("spotify")?SPOTIFY:"https://www.youtube.com/watch?v=Abcde_12-XY")),1,false));providers.add(provider);}
  var worker=new CatalogEnrichmentWorker(queue,cifra,lyrics,providers);try{for(int i=0;i<4;i++)worker.processOne();}finally{worker.close();}
  assertThat(queue.prepared(admin,song,"lyrics").state()).isEqualTo("COMPLETED");assertThat(queue.prepared(admin,song,"lyrics").candidates()).isEmpty();
  for(String provider:List.of("cifra","spotify","youtube")){assertThat(queue.prepared(admin,song,provider).state()).isEqualTo("READY");assertThat(queue.prepared(admin,song,provider).candidates()).hasSize(1);}
  assertThat(streaming.admin(admin,song,"spotify").url()).isNull();assertThat(chords.admin(admin,song).officialUrl()).isNull();assertThat(catalog.get(song).status()).isEqualTo("PENDING");
 }
 @Test void incompleteArtistWaitsAndCorrectedMetadataResumes(){
  UUID song=add("");assertThat(queue.claim()).isEmpty();assertThat(queue.prepared(admin,song,"cifra").state()).isEqualTo("WAITING_METADATA");
  var before=catalog.get(song);catalog.edit(admin,song,before.version(),before.title(),"Artist");assertThat(claim("cifra").artist()).isEqualTo("Artist");
 }
 @Test void staleResultsAreDiscardedAfterSongCorrection(){
  UUID song=add("Artist");var claim=claim("cifra");var before=catalog.get(song);catalog.edit(admin,song,before.version(),"Corrected "+before.title(),"New artist");
  queue.complete(claim,List.of(candidate("cifra")));assertThat(queue.prepared(admin,song,"cifra").candidates()).isEmpty();assertThat(queue.prepared(admin,song,"cifra").state()).isEqualTo("QUEUED");
 }
 @Test void anOfficialReferenceSetDuringLookupIsNeverOverwritten(){
  UUID song=add("Artist");var claim=claim("spotify");streaming.save(admin,song,"spotify",0,SPOTIFY);queue.complete(claim,List.of(candidate("spotify")));
  assertThat(streaming.admin(admin,song,"spotify").url()).isEqualTo(SPOTIFY);assertThat(queue.prepared(admin,song,"spotify").state()).isEqualTo("REFERENCE_SET");assertThat(queue.prepared(admin,song,"spotify").candidates()).isEmpty();
 }
 @Test void expiredLeasesResumeAndOldWorkersCannotOverwriteNewResults(){
  UUID song=add("Artist");var old=claim("cifra");jdbc.sql("UPDATE singflow.catalog_enrichment_jobs SET lease_until=now()-interval '1 minute' WHERE song_id=? AND provider='cifra'").param(song).update();var next=claim("cifra");assertThat(next.token()).isNotEqualTo(old.token());
  queue.complete(old,List.of(candidate("cifra")));assertThat(queue.prepared(admin,song,"cifra").state()).isEqualTo("PROCESSING");queue.complete(next,List.of(candidate("cifra")));assertThat(queue.prepared(admin,song,"cifra").state()).isEqualTo("READY");
 }
 @Test void failuresRespectRetryAfterAndStopAfterThreeAttempts(){
  UUID song=add("Artist");var claim=claim("youtube");var error=new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS){@Override public HttpHeaders getHeaders(){var h=new HttpHeaders();h.set("Retry-After","120");return h;}};
  queue.failed(claim,error);assertThat(queue.prepared(admin,song,"youtube").state()).isEqualTo("QUEUED");assertThat(jdbc.sql("SELECT next_attempt_at>clock_timestamp()+interval '119 seconds' FROM singflow.catalog_enrichment_jobs WHERE song_id=? AND provider='youtube'").param(song).query(Boolean.class).single()).isTrue();
  for(int i=0;i<2;i++){jdbc.sql("UPDATE singflow.catalog_enrichment_jobs SET next_attempt_at=now()-interval '1 second' WHERE song_id=? AND provider='youtube'").param(song).update();queue.failed(claim("youtube"),error);}
  assertThat(queue.prepared(admin,song,"youtube").state()).isEqualTo("FAILED");
 }
 @Test void mergeTransfersJobsAndInvalidatesInflightClaimsAndCollidingSuggestions(){
  UUID source=add("Artist"),target=add("Artist");var old=claim("cifra");var destination=catalog.review(admin,target,0,"APPROVED","");
  catalog.merge(admin,source,0,target,destination.version(),"Duplicata");queue.complete(old,List.of(candidate("cifra")));
  assertThat(jobs()).isEqualTo(4);assertThat(queue.prepared(admin,target,"cifra").state()).isEqualTo("QUEUED");assertThat(queue.prepared(admin,target,"cifra").candidates()).isEmpty();
  assertThat(jdbc.sql("SELECT count(*) FROM singflow.catalog_songs WHERE id=?").param(source).query(Long.class).single()).isZero();
 }
 @Test void adminOnlyAndClaimsAreExclusiveAcrossConcurrentWorkers() throws Exception {
  UUID song=add("Artist");mvc.perform(get("/api/admin/catalog/songs/"+song+"/enrichment/cifra").with(user(admin).roles("ADMIN"))).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("QUEUED"));
  mvc.perform(get("/api/admin/catalog/songs/"+song+"/enrichment/cifra").with(user(musician).roles("MUSICIAN"))).andExpect(status().isForbidden());
  try(var pool=Executors.newFixedThreadPool(2)){var a=pool.submit(()->queue.claim().orElseThrow());var b=pool.submit(()->queue.claim().orElseThrow());assertThat(a.get(5,TimeUnit.SECONDS).provider()).isNotEqualTo(b.get(5,TimeUnit.SECONDS).provider());}
 }
 @Test void upgradesV20WithoutBackfillingOldSongsOrChangingReferences() throws Exception {
  String database="enrich_upgrade_"+UUID.randomUUID().toString().replace("-","");String url=postgres.getJdbcUrl().replace("/"+postgres.getDatabaseName(),"/"+database);
  try(var c=java.sql.DriverManager.getConnection(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword());var statement=c.createStatement()){statement.execute("CREATE DATABASE "+database);}
  try{
   org.flywaydb.core.Flyway.configure().dataSource(url,postgres.getUsername(),postgres.getPassword()).target("20").load().migrate();
   UUID id=UUID.randomUUID();try(var c=java.sql.DriverManager.getConnection(url,postgres.getUsername(),postgres.getPassword());var q=c.prepareStatement("INSERT INTO singflow.catalog_songs(id,title,artist,status,source,spotify_url) VALUES(?,'Legacy','Artist','APPROVED','ADMIN',?)")){q.setObject(1,id);q.setString(2,SPOTIFY);q.executeUpdate();}
   var flyway=org.flywaydb.core.Flyway.configure().dataSource(url,postgres.getUsername(),postgres.getPassword()).load();flyway.migrate();assertThat(flyway.info().applied()).hasSize(24);
   try(var c=java.sql.DriverManager.getConnection(url,postgres.getUsername(),postgres.getPassword());var q=c.createStatement()){
    try(var rs=q.executeQuery("SELECT count(*) FROM singflow.catalog_enrichment_jobs")){rs.next();assertThat(rs.getLong(1)).isZero();}
    try(var rs=q.executeQuery("SELECT spotify_url FROM singflow.catalog_songs")){rs.next();assertThat(rs.getString(1)).isEqualTo(SPOTIFY);}
   }
  }finally{try(var c=java.sql.DriverManager.getConnection(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword());var q=c.createStatement()){q.execute("DROP DATABASE "+database+" WITH (FORCE)");}}
 }
}
