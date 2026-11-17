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

@Testcontainers
@SpringBootTest(properties={"SINGFLOW_ENRICHMENT_ENABLED=false","SINGFLOW_LYRICS_PREFETCH_ENABLED=false","spring.application.name=singflow-catalog-management-tests", "SINGFLOW_HOST_EMAIL=", "SINGFLOW_HOST_PASSWORD=", "LASTFM_API_KEY=", "SINGFLOW_CATALOG_SYNC_ENABLED=false"})
@AutoConfigureMockMvc
class CatalogManagementIntegrationTests {
  @Container @ServiceConnection static PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:17.6");
  @Autowired JdbcClient jdbc;
  @Autowired CatalogService catalog;
  @Autowired CatalogSync sync;
  @Autowired LastfmChoices choices;
  @Autowired MockMvc mvc;
  String admin;
  @BeforeEach void fixtures() {
    for (String table:List.of("catalog_sync_candidates","catalog_sync_audit","catalog_sync_items","catalog_sync_runs","stage_calls","song_requests","participants","sessions","catalog_audit","catalog_aliases","catalog_redirects","catalog_songs"))
      jdbc.sql("DELETE FROM singflow."+table).update();
    admin=UUID.randomUUID()+"@example.test";
    jdbc.sql("INSERT INTO singflow.host_accounts(email,password_hash,administrator) VALUES(?,'unused',true)").param(admin).update();
  }
  CatalogService.Song song(String title) { return catalog.create(admin,UUID.randomUUID(),title,"Artist"); }
  CatalogService.Song provisional(String title) {
    var song=song(title);
    jdbc.sql("UPDATE singflow.catalog_songs SET status='PENDING' WHERE id=?").param(song.id()).update();
    return song;
  }
  void conflict(Runnable action) {
    assertThatThrownBy(action::run).isInstanceOfSatisfying(ResponseStatusException.class,e -> assertThat(e.getStatusCode().value()).isEqualTo(409));
  }
  @Test void onlyUnusedSongsCanBeDeletedAndRetriesDoNotDuplicateAudit() throws Exception {
    var song=song("Unused");
    String path="/api/admin/catalog/songs/"+song.id()+"/delete";
    mvc.perform(post(path).with(user(admin).roles("ADMIN")).contentType("application/json").content("{\"version\":0}")).andExpect(status().isForbidden());
    mvc.perform(post(path).with(user(admin).roles("ADMIN")).with(csrf()).contentType("application/json").content("{\"version\":0}")).andExpect(status().isOk());
    catalog.delete(admin,song.id(),0);
    conflict(()->catalog.create(admin,song.id(),song.title(),song.artist()));
    assertThat(catalog.list(admin,"","",0,10).items()).isEmpty();
    assertThat(catalog.browse(0,10).items()).isEmpty();
    assertThat(catalog.approved("Unused")).isEmpty();
    assertThat(catalog.history(admin,song.id()).stream().filter(e->e.action().equals("DELETED"))).hasSize(1);
    assertThat(catalog.alias("Unused","Artist")).isEmpty();
    assertThatThrownBy(()->catalog.details(admin,song.id())).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(404));
  }
  void usage(CatalogService.Song song, boolean performance) {
    UUID session=UUID.randomUUID(), person=UUID.randomUUID();
    jdbc.sql("INSERT INTO singflow.sessions(id,owner,name,status,created_at) VALUES(?,?,'Closed','CLOSED',now())").params(session,admin).update();
    jdbc.sql("INSERT INTO singflow.participants(id,session_id,name,status,origin,checked_in_at,queue_joined_at) VALUES(?,?,'Person','LEFT','ASSISTED',now(),now())").params(person,session).update();
    if (performance) jdbc.sql("INSERT INTO singflow.stage_calls(id,session_id,participant_id,status,created_at,resolved_at,resolution_order,catalog_song_id) VALUES(?,?,?,'COMPLETED',now(),now(),nextval('singflow.stage_resolution_order_seq'),?)").params(UUID.randomUUID(),session,person,song.id()).update();
    else jdbc.sql("INSERT INTO singflow.song_requests(id,session_id,participant_id,creation_fingerprint,status,created_at,catalog_song_id) VALUES(?,?,?,'test','CANCELLED',now(),?)").params(UUID.randomUUID(),session,person,song.id()).update();
  }
  @Test void cancelledRequestsAndHistoricalPerformancesBothPreventDeletion() {
    var requested=song("Request"); var performed=song("Performance");
    usage(requested,false); usage(performed,true);
    conflict(()->catalog.delete(admin,requested.id(),0));
    conflict(()->catalog.delete(admin,performed.id(),0));
    assertThat(catalog.deleted(requested.id())).isFalse();
    assertThat(catalog.deleted(performed.id())).isFalse();
  }
  @Test void synchronizationAndBothSidesOfAMergePreventDeletion() {
    var pending=provisional("Pending");
    sync.start(admin,UUID.randomUUID());
    conflict(()->catalog.delete(admin,pending.id(),0));
    var source=song("Source"); var target=song("Target");
    catalog.merge(admin,source.id(),0,target.id(),0,"Duplicate");
    assertThat(jdbc.sql("SELECT count(*) FROM singflow.catalog_songs WHERE id=?").param(source.id()).query(Long.class).single()).isZero();
    conflict(()->catalog.delete(admin,target.id(),0));
  }
  @Test void importsRequireRealProviderProofAreIdempotentAndReuseTheSameSong() {
    var token=choices.issue(new SongSearch.Song("External","Artist","https://www.last.fm/music/Artist/_/External",""));
    UUID operation=UUID.randomUUID();
    var imported=catalog.importChoice(admin,operation,"External","Artist",token);
    assertThat(imported.status()).isEqualTo("APPROVED");
    assertThat(imported.source()).isEqualTo("ADMIN");
    assertThat(catalog.importChoice(admin,operation,"External","Artist",token).id()).isEqualTo(imported.id());
    assertThat(catalog.importChoice(admin,UUID.randomUUID(),"External","Artist",token).id()).isEqualTo(imported.id());
    conflict(()->catalog.importChoice(admin,UUID.randomUUID(),"Modified","Artist",token));
    catalog.delete(admin,imported.id(),imported.version());
    assertThat(catalog.deleted(imported.id())).isTrue();
  }
  @Test void adminPaginationIsAlphabeticalAndValidatesPageSize() {
    for(int i=19;i>=0;i--)song(String.format("Song %02d",i));
    var first=catalog.list(admin,"","",0,10);
    var second=catalog.list(admin,"","",1,10);
    assertThat(first.items()).hasSize(10);
    assertThat(first.items().getFirst().title()).isEqualTo("Song 00");
    assertThat(second.items().getFirst().title()).isEqualTo("Song 10");
    assertThatThrownBy(()->catalog.list(admin,"","",0,100)).isInstanceOf(ResponseStatusException.class);
  }
  @Test void workspaceResetsOnlyAfterAllAttentionIsResolvedAndKeepsAudit() {
    provisional("Automatic"); var manual=provisional("Manual");
    var run=sync.start(admin,UUID.randomUUID());
    for(int i=0;i<2;i++) {
      var claim=sync.claim().orElseThrow();
      sync.complete(claim,List.of(new SongSearch.Song(claim.item().title().equals("Manual")?"Different":"Automatic","Artist")));
    }
    assertThat(sync.workspace(admin).current()).isNotNull();
    var attention=sync.items(admin,run.id(),"attention",0);
    assertThat(attention.items()).hasSize(1);
    var item=attention.items().getFirst();
    var choice=new CatalogSync.Choice(item.revision(),null,"Reviewed","Artist");
    sync.approve(admin,item.id(),choice,null,null);
    assertThat(sync.workspace(admin).current()).isNull();
    assertThat(sync.runs(admin)).hasSize(1);
    assertThat(sync.items(admin,run.id(),"activity",0).items()).hasSize(2);
  }
  @Test void deletionAndSynchronizationSerializeBeforeAnyAssociationCanBeLost() throws Exception {
    var song=provisional("Race");
    var start=new CountDownLatch(1);
    try(var pool=Executors.newVirtualThreadPerTaskExecutor()) {
      var deleted=pool.submit(()->{ start.await();try {catalog.delete(admin,song.id(),0);return true;}catch(ResponseStatusException e){assertThat(e.getStatusCode().value()).isEqualTo(409);return false;} });
      var running=pool.submit(()->{start.await();return sync.start(admin,UUID.randomUUID());});
      start.countDown();
      var run=running.get(10,TimeUnit.SECONDS);
      boolean removed=deleted.get(10,TimeUnit.SECONDS);
      assertThat(sync.progress(admin,run.id()).counts().total()).isEqualTo(removed?0:1);
      assertThat(catalog.deleted(song.id())).isEqualTo(removed);
    }
  }
}
