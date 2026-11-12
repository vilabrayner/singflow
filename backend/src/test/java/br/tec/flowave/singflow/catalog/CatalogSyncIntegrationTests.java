package br.tec.flowave.singflow.catalog;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
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
@SpringBootTest(
    properties = {
      "spring.application.name=singflow-sync-tests",
      "SINGFLOW_HOST_EMAIL=",
      "SINGFLOW_HOST_PASSWORD=",
      "LASTFM_API_KEY=",
      "SINGFLOW_CATALOG_SYNC_ENABLED=false"
    })
@AutoConfigureMockMvc
class CatalogSyncIntegrationTests {
  @Container @ServiceConnection
  static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17.6");

  @Autowired JdbcClient jdbc;
  @Autowired CatalogService catalog;
  @Autowired CatalogSync sync;
  @Autowired MockMvc mvc;
  @org.springframework.test.context.bean.override.mockito.MockitoBean SongSearch search;
  String admin;

  @BeforeEach
  void fixtures() {
    jdbc.sql("DELETE FROM singflow.catalog_sync_candidates").update();
    jdbc.sql("DELETE FROM singflow.catalog_sync_audit").update();
    jdbc.sql("DELETE FROM singflow.catalog_sync_items").update();
    jdbc.sql("DELETE FROM singflow.catalog_sync_runs").update();
    jdbc.sql("DELETE FROM singflow.catalog_audit").update();
    jdbc.sql("DELETE FROM singflow.catalog_aliases").update();
    jdbc.sql("DELETE FROM singflow.catalog_songs").update();
    admin = account(true);
    when(search.configured()).thenReturn(true);
  }

  String account(boolean administrator) {
    String actor = UUID.randomUUID() + "@example.test";
    jdbc.sql(
            "INSERT INTO singflow.host_accounts(email,password_hash,administrator)"
                + " VALUES(?,'unused',?)")
        .params(actor, administrator)
        .update();
    return actor;
  }

  CatalogService.Song pending(String title, String artist) {
    var song = catalog.create(admin, UUID.randomUUID(), title, artist);
    jdbc.sql("UPDATE singflow.catalog_songs SET status='PENDING' WHERE id=?")
        .param(song.id())
        .update();
    return song;
  }

  CatalogSync.Claim claim() {
    return sync.claim().orElseThrow();
  }

  String songStatus(UUID id) {
    return jdbc.sql("SELECT status FROM singflow.catalog_songs WHERE id=?")
        .param(id)
        .query(String.class)
        .single();
  }

  void conflict(Runnable action) {
    assertThatThrownBy(action::run)
        .isInstanceOfSatisfying(
            ResponseStatusException.class,
            e -> assertThat(e.getStatusCode().value()).isEqualTo(409));
  }

  @Test
  void exactMatchesApproveOnlyProvisionalSongsAndPersistProgressAndReference() {
    var song = pending("Café  Azul", "Artista");
    catalog.create(admin, UUID.randomUUID(), "Outra", "Artista");
    UUID operation = UUID.randomUUID();
    var run = sync.start(admin, operation);
    assertThat(sync.start(admin, operation).id()).isEqualTo(run.id());
    conflict(() -> sync.start(admin, UUID.randomUUID()));
    var claim = claim();
    sync.complete(
        claim,
        List.of(
            new SongSearch.Song(
                "CAFÉ Azul",
                "ARTISTA",
                "https://www.last.fm/music/A/_/B",
                "11111111-1111-4111-8111-111111111111")));
    var progress = sync.progress(admin, run.id());
    assertThat(progress.counts().total()).isEqualTo(1);
    assertThat(progress.counts().automatic()).isEqualTo(1);
    assertThat(progress.run().status()).isEqualTo("COMPLETED");
    assertThat(songStatus(song.id())).isEqualTo("APPROVED");
    assertThat(
            jdbc.sql("SELECT lastfm_url FROM singflow.catalog_songs WHERE id=?")
                .param(song.id())
                .query(String.class)
                .single())
        .startsWith("https://www.last.fm/");
    assertThat(catalog.history(admin, song.id()))
        .extracting(CatalogService.Event::action)
        .contains("SYNC_AUTO_APPROVED");
  }

  @Test
  void missingArtistAlwaysRequiresAnExplicitChoiceAndApproval() {
    var song = pending("Equalize", "");
    var run = sync.start(admin, UUID.randomUUID());
    var claim = claim();
    sync.complete(claim, List.of(new SongSearch.Song("Equalize", "Pitty")));
    var detail = sync.detail(admin, claim.item().id());
    assertThat(songStatus(song.id())).isEqualTo("PENDING");
    assertThat(detail.item().state()).isEqualTo("REVIEW");
    assertThat(sync.progress(admin, run.id()).counts().review()).isEqualTo(1);
    var choice = new CatalogSync.Choice(detail.item().revision(), 0, null, null);
    var preview = sync.preview(admin, detail.item().id(), choice);
    assertThat(preview.artist()).isEqualTo("Pitty");
    assertThat(preview.existing()).isNull();
    sync.approve(admin, detail.item().id(), choice, null, null);
    assertThat(songStatus(song.id())).isEqualTo("APPROVED");
    assertThat(sync.progress(admin, run.id()).counts().approved()).isEqualTo(1);
    conflict(() -> sync.approve(admin, detail.item().id(), choice, null, null));
  }

  @Test
  void existingSongRequiresExplicitLinkAndVersionConfirmation() {
    var source = pending("Nome incompleto", "");
    var target = catalog.create(admin, UUID.randomUUID(), "Nome correto", "Artista");
    sync.start(admin, UUID.randomUUID());
    var claim = claim();
    sync.complete(claim, List.of(new SongSearch.Song(target.title(), target.artist())));
    var item = sync.detail(admin, claim.item().id()).item();
    var choice = new CatalogSync.Choice(item.revision(), 0, null, null);
    assertThat(sync.preview(admin, item.id(), choice).existing().id()).isEqualTo(target.id());
    conflict(() -> sync.approve(admin, item.id(), choice, null, null));
    assertThat(songStatus(source.id())).isEqualTo("PENDING");
    sync.approve(admin, item.id(), choice, target.id(), target.version());
    assertThat(songStatus(source.id())).isEqualTo("MERGED");
    assertThat(
            jdbc.sql("SELECT singflow.catalog_root(?)")
                .param(source.id())
                .query(UUID.class)
                .single())
        .isEqualTo(target.id());
    assertThat(catalog.history(admin, source.id()))
        .extracting(CatalogService.Event::action)
        .contains("SYNC_LINKED");
  }

  @Test
  void manualReviewWorksWithoutCandidatesAndConcurrentApprovalRunsOnlyOnce() throws Exception {
    var song = pending("Sem resultado", "");
    sync.start(admin, UUID.randomUUID());
    var claim = claim();
    sync.complete(claim, List.of());
    var detail = sync.detail(admin, claim.item().id());
    assertThat(detail.candidates()).isEmpty();
    var choice =
        new CatalogSync.Choice(detail.item().revision(), null, "Nome corrigido", "Artista");
    try (var pool = Executors.newFixedThreadPool(2)) {
      Callable<Boolean> action =
          () -> {
            try {
              sync.approve(admin, detail.item().id(), choice, null, null);
              return true;
            } catch (ResponseStatusException e) {
              assertThat(e.getStatusCode().value()).isEqualTo(409);
              return false;
            }
          };
      var one = pool.submit(action);
      var two = pool.submit(action);
      assertThat(List.of(one.get(10, TimeUnit.SECONDS), two.get(10, TimeUnit.SECONDS)))
          .containsExactlyInAnyOrder(true, false);
    }
    assertThat(catalog.history(admin, song.id()))
        .filteredOn(e -> e.action().equals("SYNC_APPROVED"))
        .hasSize(1);
  }

  @Test
  void pauseAndExpiredLeasesNeverApplyOldResults() {
    var song = pending("Song", "Artist");
    var run = sync.start(admin, UUID.randomUUID());
    var old = claim();
    sync.control(admin, run.id(), "pause");
    sync.complete(old, List.of(new SongSearch.Song("Song", "Artist")));
    assertThat(songStatus(song.id())).isEqualTo("PENDING");
    assertThat(sync.detail(admin, old.item().id()).item().state()).isEqualTo("QUEUED");
    sync.control(admin, run.id(), "resume");
    var expired = claim();
    jdbc.sql(
            "UPDATE singflow.catalog_sync_items SET lease_until=clock_timestamp()-interval '1"
                + " second' WHERE id=?")
        .param(expired.item().id())
        .update();
    var fresh = claim();
    assertThat(fresh.token()).isNotEqualTo(expired.token());
    sync.complete(expired, List.of(new SongSearch.Song("Song", "Artist")));
    assertThat(songStatus(song.id())).isEqualTo("PENDING");
    sync.complete(fresh, List.of(new SongSearch.Song("Song", "Artist")));
    assertThat(songStatus(song.id())).isEqualTo("APPROVED");
  }

  @Test
  void externalEditsArePreservedAndCanBeQueriedAgain() {
    var song = pending("Song", "Artist");
    var run = sync.start(admin, UUID.randomUUID());
    var claim = claim();
    catalog.edit(admin, song.id(), 0, "Song corrected", "Artist");
    sync.complete(claim, List.of(new SongSearch.Song("Song", "Artist")));
    var stale = sync.detail(admin, claim.item().id()).item();
    assertThat(stale.state()).isEqualTo("SKIPPED");
    assertThat(songStatus(song.id())).isEqualTo("PENDING");
    sync.retry(admin, stale.id(), stale.revision());
    var next = claim();
    assertThat(next.item().title()).isEqualTo("Song corrected");
    sync.complete(next, List.of(new SongSearch.Song("Song corrected", "Artist")));
    assertThat(sync.progress(admin, run.id()).counts().automatic()).isEqualTo(1);
  }

  @Test
  void failedCallsHaveBoundedRetriesAndNoFalseApproval() {
    var song = pending("Song", "Artist");
    var run = sync.start(admin, UUID.randomUUID());
    CatalogSync.Claim last = null;
    for (int i = 0; i < 3; i++) {
      last = claim();
      sync.failed(last, true);
      jdbc.sql(
              "UPDATE singflow.catalog_sync_items SET next_attempt_at=clock_timestamp()-interval '1"
                  + " second' WHERE id=?")
          .param(last.item().id())
          .update();
    }
    assertThat(sync.progress(admin, run.id()).counts().failed()).isEqualTo(1);
    assertThat(songStatus(song.id())).isEqualTo("PENDING");
    assertThat(sync.detail(admin, last.item().id()).item().attempts()).isEqualTo(3);
    sync.retry(admin, last.item().id(), sync.detail(admin, last.item().id()).item().revision());
    assertThat(sync.progress(admin, run.id()).run().status()).isEqualTo("RUNNING");
  }

  @Test
  void administratorRevocationPausesTheJobAndOtherAdminMayResume() {
    var song = pending("Song", "Artist");
    var run = sync.start(admin, UUID.randomUUID());
    var claim = claim();
    jdbc.sql("UPDATE singflow.host_accounts SET administrator=false WHERE email=?")
        .param(admin)
        .update();
    sync.complete(claim, List.of(new SongSearch.Song("Song", "Artist")));
    assertThat(songStatus(song.id())).isEqualTo("PENDING");
    String other = account(true);
    assertThat(sync.progress(other, run.id()).run().status()).isEqualTo("PAUSED");
    sync.control(other, run.id(), "resume");
    var next = claim();
    sync.complete(next, List.of(new SongSearch.Song("Song", "Artist")));
    assertThat(catalog.history(other, song.id()).getFirst().actor()).isEqualTo(other);
  }

  @Test
  void syncEndpointsEnforceAdminCsrfAndConfiguration() throws Exception {
    String host = account(false);
    String path = "/api/admin/catalog/sync/runs";
    mvc.perform(get(path)).andExpect(status().isUnauthorized());
    mvc.perform(get(path).with(user(host).roles("HOST", "ADMIN")))
        .andExpect(status().isForbidden());
    String body = "{\"operationId\":\"" + UUID.randomUUID() + "\"}";
    mvc.perform(
            post(path)
                .with(user(admin).roles("HOST", "ADMIN"))
                .contentType("application/json")
                .content(body))
        .andExpect(status().isForbidden());
    when(search.configured()).thenReturn(false);
    mvc.perform(
            post(path)
                .with(user(admin).roles("HOST", "ADMIN"))
                .with(csrf())
                .contentType("application/json")
                .content(body))
        .andExpect(status().isServiceUnavailable());
    when(search.configured()).thenReturn(true);
    mvc.perform(
            post(path)
                .with(user(admin).roles("HOST", "ADMIN"))
                .with(csrf())
                .contentType("application/json")
                .content(body))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("COMPLETED"));
  }

  @Test
  void overlappingStartsCreateOnlyOneActiveRun() throws Exception {
    pending("Song", "Artist");
    try (var pool = Executors.newFixedThreadPool(2)) {
      Callable<Boolean> start =
          () -> {
            try {
              sync.start(admin, UUID.randomUUID());
              return true;
            } catch (ResponseStatusException e) {
              assertThat(e.getStatusCode().value()).isEqualTo(409);
              return false;
            }
          };
      var a = pool.submit(start);
      var b = pool.submit(start);
      assertThat(List.of(a.get(10, TimeUnit.SECONDS), b.get(10, TimeUnit.SECONDS)))
          .containsExactlyInAnyOrder(true, false);
    }
  }

  @Test
  void ambiguousExactResultsNeverAutoApproveAndExternalReviewsArePreserved() {
    var song = pending("Song", "Artist");
    var run = sync.start(admin, UUID.randomUUID());
    var claim = claim();
    sync.complete(
        claim,
        List.of(
            new SongSearch.Song(
                "Song",
                "Artist",
                "https://www.last.fm/music/A/_/B",
                "11111111-1111-4111-8111-111111111111"),
            new SongSearch.Song(
                "Song",
                "Artist",
                "https://www.last.fm/music/A/_/B",
                "22222222-2222-4222-8222-222222222222")));
    assertThat(sync.detail(admin, claim.item().id()).candidates()).hasSize(2);
    assertThat(songStatus(song.id())).isEqualTo("PENDING");
    catalog.review(admin, song.id(), 0, "APPROVED", "");
    assertThat(sync.progress(admin, run.id()).counts().review()).isZero();
    assertThat(sync.detail(admin, claim.item().id()).item().state()).isEqualTo("SKIPPED");
  }

  @Autowired CatalogRefinement refinement;

  @Test
  void refinedSearchUsesEditedFieldsReplacesCandidatesAndDoesNotSaveOrAutoApprove() {
    var source = pending("Gis", "");
    var run = sync.start(admin, UUID.randomUUID());
    var claim = claim();
    sync.complete(claim, List.of(new SongSearch.Song("Gis", "Outro artista")));
    var before = sync.detail(admin, claim.item().id());
    when(search.searchForCatalog("Giz", "Legião Urbana"))
        .thenReturn(
            List.of(
                new SongSearch.Song(
                    "Giz", "Legião Urbana", "https://www.last.fm/music/Legiao/_/Giz", "")));
    var result =
        refinement.search(
            admin, before.item().id(), before.item().revision(), "Giz", "Legião Urbana");
    verify(search).searchForCatalog("Giz", "Legião Urbana");
    assertThat(result.candidates()).hasSize(1);
    assertThat(result.candidates().getFirst().artist()).isEqualTo("Legião Urbana");
    assertThat(result.item().revision()).isGreaterThan(before.item().revision());
    assertThat(catalog.get(source.id()).title()).isEqualTo("Gis");
    assertThat(catalog.get(source.id()).artist()).isEmpty();
    assertThat(catalog.get(source.id()).version()).isZero();
    assertThat(songStatus(source.id())).isEqualTo("PENDING");
    assertThat(sync.progress(admin, run.id()).counts().automatic()).isZero();
    conflict(
        () ->
            sync.preview(
                admin,
                before.item().id(),
                new CatalogSync.Choice(before.item().revision(), 0, null, null)));
    sync.approve(
        admin,
        result.item().id(),
        new CatalogSync.Choice(result.item().revision(), 0, null, null),
        null,
        null);
    assertThat(catalog.get(source.id()).title()).isEqualTo("Giz");
    assertThat(songStatus(source.id())).isEqualTo("APPROVED");
  }

  @Test
  void failedRefinementKeepsPreviousResultsAndAConcurrentEditPreventsReplacement() {
    var source = pending("Gis", "");
    sync.start(admin, UUID.randomUUID());
    var claim = claim();
    sync.complete(claim, List.of(new SongSearch.Song("Gis", "Anterior")));
    var before = sync.detail(admin, claim.item().id());
    when(search.searchForCatalog("Giz", "Legião Urbana"))
        .thenThrow(
            new ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE));
    assertThatThrownBy(
            () ->
                refinement.search(
                    admin, before.item().id(), before.item().revision(), "Giz", "Legião Urbana"))
        .isInstanceOf(ResponseStatusException.class);
    assertThat(sync.detail(admin, before.item().id())).isEqualTo(before);
    var query =
        sync.refinement(
            admin, before.item().id(), before.item().revision(), "Giz", "Legião Urbana");
    catalog.edit(admin, source.id(), 0, "Gis atualizada", "");
    conflict(
        () -> sync.refined(admin, query, List.of(new SongSearch.Song("Giz", "Legião Urbana"))));
    assertThat(sync.detail(admin, before.item().id()).candidates()).isEqualTo(before.candidates());
    assertThat(catalog.get(source.id()).title()).isEqualTo("Gis atualizada");
  }

  @Test
  void refinedSearchEndpointRequiresAdminAndCsrfAndAcceptsNoResults() throws Exception {
    pending("Gis", "");
    sync.start(admin, UUID.randomUUID());
    var claim = claim();
    sync.complete(claim, List.of(new SongSearch.Song("Gis", "Anterior")));
    var before = sync.detail(admin, claim.item().id());
    String path = "/api/admin/catalog/sync/items/" + before.item().id() + "/search";
    String body =
        "{\"revision\":"
            + before.item().revision()
            + ",\"title\":\"Giz\",\"artist\":\"Legião Urbana\"}";
    mvc.perform(
            post(path)
                .with(user(admin).roles("HOST", "ADMIN"))
                .contentType("application/json")
                .content(body))
        .andExpect(status().isForbidden());
    String host = account(false);
    mvc.perform(
            post(path)
                .with(user(host).roles("HOST", "ADMIN"))
                .with(csrf())
                .contentType("application/json")
                .content(body))
        .andExpect(status().isForbidden());
    when(search.searchForCatalog("Giz", "Legião Urbana")).thenReturn(List.of());
    mvc.perform(
            post(path)
                .with(user(admin).roles("HOST", "ADMIN"))
                .with(csrf())
                .contentType("application/json")
                .content(body))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.item.state").value("REVIEW"))
        .andExpect(jsonPath("$.candidates.length()").value(0));
    assertThat(
            sync.preview(
                    admin,
                    before.item().id(),
                    new CatalogSync.Choice(
                        before.item().revision() + 1, null, "Giz", "Legião Urbana"))
                .title())
        .isEqualTo("Giz");
  }

  @Test
  void activityUsesApprovedCanonicalMetadataAndKeepsTheOriginalReviewSnapshot() {
    var source = pending("Gis", "");
    var run = sync.start(admin, UUID.randomUUID());
    var claim = claim();
    sync.complete(claim, List.of(new SongSearch.Song("Giz", "Legião Urbana")));
    var original = sync.detail(admin, claim.item().id());
    sync.approve(
        admin,
        original.item().id(),
        new CatalogSync.Choice(original.item().revision(), 0, null, null),
        null,
        null);
    var row = sync.items(admin, run.id(), "activity", 0).items().getFirst();
    assertThat(row.title()).isEqualTo("Giz");
    assertThat(row.artist()).isEqualTo("Legião Urbana");
    assertThat(sync.detail(admin, original.item().id()).item().title()).isEqualTo("Gis");
    assertThat(sync.detail(admin, original.item().id()).item().artist()).isEmpty();
  }

  @Test
  void mergedActivityUsesDestinationMetadata() {
    pending("Nome incompleto", "");
    var target = catalog.create(admin, UUID.randomUUID(), "Nome oficial", "Artista");
    var run = sync.start(admin, UUID.randomUUID());
    var claim = claim();
    sync.complete(claim, List.of(new SongSearch.Song(target.title(), target.artist())));
    var original = sync.detail(admin, claim.item().id()).item();
    sync.approve(
        admin,
        original.id(),
        new CatalogSync.Choice(original.revision(), 0, null, null),
        target.id(),
        target.version());
    var row = sync.items(admin, run.id(), "activity", 0).items().getFirst();
    assertThat(row.state()).isEqualTo("MERGED");
    assertThat(row.title()).isEqualTo(target.title());
    assertThat(row.artist()).isEqualTo(target.artist());
  }

  @Test
  void pendingReviewTracksActualCatalogStateEvenForSkippedItems() {
    var source = pending("Gis", "");
    var run = sync.start(admin, UUID.randomUUID());
    var claim = claim();
    sync.complete(claim, List.of());
    assertThat(sync.progress(admin, run.id()).pendingReview()).isEqualTo(1);
    catalog.edit(admin, source.id(), 0, "Giz", "");
    assertThat(sync.progress(admin, run.id()).counts().review()).isZero();
    assertThat(sync.progress(admin, run.id()).pendingReview()).isEqualTo(1);
    catalog.review(admin, source.id(), 1, "APPROVED", "");
    assertThat(sync.progress(admin, run.id()).pendingReview()).isZero();
  }
}
