package br.tec.flowave.singflow.catalog;

import br.tec.flowave.singflow.identity.AccountLifecycle;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CatalogSync {
  public record Run(UUID id, String status, String startedBy, Instant createdAt, String message) {}

  public record Counts(
      long total,
      long processed,
      long automatic,
      long approved,
      long review,
      long failed,
      long skipped,
      long queued,
      long processing) {}

  public record Progress(Run run, Counts counts, String currentTitle, long pendingReview) {}

  public record Item(
      UUID id,
      UUID runId,
      UUID songId,
      String title,
      String artist,
      long songVersion,
      String state,
      long revision,
      int attempts,
      String message,
      Instant updatedAt) {}

  public record Page(List<Item> items, long total, int page, int size) {}

  public record Candidate(
      int position,
      String title,
      String artist,
      String url,
      String mbid,
      int score,
      CatalogService.Song existing) {}

  public record Detail(Item item, List<Candidate> candidates) {}

  public record Choice(long revision, Integer position, String title, String artist) {}

  public record Preview(
      Item item,
      String title,
      String artist,
      String url,
      String mbid,
      CatalogService.Song existing) {}

  public record Claim(Item item, UUID token) {}

  private final JdbcClient jdbc;
  private final CatalogService catalog;
  private final AccountLifecycle accounts;

  public CatalogSync(JdbcClient jdbc, CatalogService catalog, AccountLifecycle accounts) {
    this.jdbc = jdbc;
    this.catalog = catalog;
    this.accounts = accounts;
  }

  private ResponseStatusException conflict(String message) {
    return new ResponseStatusException(HttpStatus.CONFLICT, message);
  }

  private Run mapRun(java.sql.ResultSet rs, int row) throws java.sql.SQLException {
    return new Run(
        rs.getObject("id", UUID.class),
        rs.getString("status"),
        rs.getString("started_by"),
        rs.getTimestamp("created_at").toInstant(),
        rs.getString("message"));
  }

  private Item mapItem(java.sql.ResultSet rs, int row) throws java.sql.SQLException {
    return new Item(
        rs.getObject("id", UUID.class),
        rs.getObject("run_id", UUID.class),
        rs.getObject("song_id", UUID.class),
        rs.getString("title"),
        rs.getString("artist"),
        rs.getLong("song_version"),
        rs.getString("state"),
        rs.getLong("revision"),
        rs.getInt("attempts"),
        rs.getString("message"),
        rs.getTimestamp("updated_at").toInstant());
  }

  private Run run(UUID id) {
    return jdbc.sql("SELECT * FROM singflow.catalog_sync_runs WHERE id=?")
        .param(id)
        .query(this::mapRun)
        .optional()
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
  }

  private Item item(UUID id) {
    return jdbc.sql("SELECT * FROM singflow.catalog_sync_items WHERE id=?")
        .param(id)
        .query(this::mapItem)
        .optional()
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
  }

  private void audit(UUID run, UUID item, String actor, String action) {
    jdbc.sql(
            "INSERT INTO singflow.catalog_sync_audit(id,run_id,item_id,actor,action)"
                + " VALUES(?,?,?,?,?)")
        .params(UUID.randomUUID(), run, item, actor, action)
        .update();
  }

  private Optional<UUID> active() {
    return jdbc.sql(
            "SELECT id FROM singflow.catalog_sync_runs WHERE status IN ('RUNNING','PAUSED')")
        .query(UUID.class)
        .optional();
  }

  @Transactional(readOnly = true)
  public List<Run> runs(String actor) {
    catalog.admin(actor);
    return jdbc.sql(
            "SELECT * FROM singflow.catalog_sync_runs ORDER BY created_at DESC,id DESC LIMIT 20")
        .query(this::mapRun)
        .list();
  }

  @Transactional
  public Run start(String actor, UUID operation) {
    catalog.admin(actor);
    catalog.lock();
    if (jdbc.sql("SELECT EXISTS(SELECT 1 FROM singflow.catalog_sync_runs WHERE id=?)")
        .param(operation)
        .query(Boolean.class)
        .single()) return run(operation);
    if (active().isPresent())
      throw conflict(
          "Já existe uma sincronização em andamento ou pausada. Abra esse lote para continuar.");
    jdbc.sql(
            "INSERT INTO singflow.catalog_sync_runs(id,status,started_by,runner)"
                + " VALUES(?,'RUNNING',?,?)")
        .params(operation, actor, actor)
        .update();
    jdbc.sql(
            "INSERT INTO singflow.catalog_sync_items(id,run_id,song_id,title,artist,song_version)"
                + " SELECT gen_random_uuid(),?,id,title,artist,version FROM singflow.catalog_songs"
                + " WHERE status='PENDING'")
        .param(operation)
        .update();
    settle(operation);
    audit(operation, null, actor, "STARTED");
    return run(operation);
  }

  @Transactional
  public Run control(String actor, UUID id, String action) {
    catalog.admin(actor);
    catalog.lock();
    var current = run(id);
    if (!Set.of("pause", "resume").contains(action))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
    if (current.status().equals("COMPLETED"))
      throw conflict(
          "As consultas desse lote já terminaram. Você ainda pode revisar os resultados.");
    jdbc.sql(
            "UPDATE singflow.catalog_sync_runs SET"
                + " status=?,runner=?,message='',updated_at=clock_timestamp() WHERE id=?")
        .params(action.equals("pause") ? "PAUSED" : "RUNNING", actor, id)
        .update();
    audit(id, null, actor, action.equals("pause") ? "PAUSED" : "RESUMED");
    return run(id);
  }

  @Transactional
  public Progress progress(String actor, UUID id) {
    catalog.admin(actor);
    catalog.lock();
    run(id);
    jdbc.sql(
            "UPDATE singflow.catalog_sync_items i SET"
                + " state='SKIPPED',revision=i.revision+1,message='O cadastro foi alterado fora"
                + " deste lote. Nenhuma alteração aplicada.',updated_at=clock_timestamp() FROM"
                + " singflow.catalog_songs s WHERE i.run_id=? AND i.song_id=s.id AND i.state IN"
                + " ('QUEUED','REVIEW','FAILED') AND (s.status<>'PENDING' OR"
                + " s.version<>i.song_version)")
        .param(id)
        .update();
    settle(id);
    var current = run(id);
    Map<String, Long> counts = new HashMap<>();
    jdbc.sql(
            "SELECT state,count(*) AS count FROM singflow.catalog_sync_items WHERE run_id=? GROUP"
                + " BY state")
        .param(id)
        .query((rs, n) -> Map.entry(rs.getString(1), rs.getLong(2)))
        .list()
        .forEach(e -> counts.put(e.getKey(), e.getValue()));
    long total = counts.values().stream().mapToLong(Long::longValue).sum();
    long queued = counts.getOrDefault("QUEUED", 0L),
        processing = counts.getOrDefault("PROCESSING", 0L);
    String title =
        jdbc.sql(
                "SELECT title FROM singflow.catalog_sync_items WHERE run_id=? AND"
                    + " state='PROCESSING' ORDER BY updated_at LIMIT 1")
            .param(id)
            .query(String.class)
            .optional()
            .orElse("");
    return new Progress(
        current,
        new Counts(
            total,
            total - queued - processing,
            counts.getOrDefault("AUTO_APPROVED", 0L),
            counts.getOrDefault("APPROVED", 0L) + counts.getOrDefault("MERGED", 0L),
            counts.getOrDefault("REVIEW", 0L),
            counts.getOrDefault("FAILED", 0L),
            counts.getOrDefault("SKIPPED", 0L),
            queued,
            processing),
        title,
        jdbc.sql(
                "SELECT count(DISTINCT s.id) FROM singflow.catalog_sync_items i JOIN"
                    + " singflow.catalog_songs s ON s.id=singflow.catalog_root(i.song_id) WHERE"
                    + " i.run_id=? AND s.status='PENDING'")
            .param(id)
            .query(Long.class)
            .single());
  }

  @Transactional(readOnly = true)
  public Page items(String actor, UUID id, String view, int page) {
    catalog.admin(actor);
    run(id);
    if (!Set.of("activity", "review").contains(view) || page < 0 || page > 100000)
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
    String filter =
        " FROM singflow.catalog_sync_items WHERE run_id=:run AND "
            + (view.equals("review") ? "state IN ('REVIEW','FAILED')" : "state<>'QUEUED'");
    long total = jdbc.sql("SELECT count(*)" + filter).param("run", id).query(Long.class).single();
    var list =
        jdbc.sql(
                "SELECT i.*,s.title AS current_title,s.artist AS current_artist FROM"
                    + " singflow.catalog_sync_items i LEFT JOIN singflow.catalog_songs s ON"
                    + " s.id=singflow.catalog_root(i.song_id) WHERE i.run_id=:run AND "
                    + (view.equals("review")
                        ? "i.state IN ('REVIEW','FAILED')"
                        : "i.state<>'QUEUED'")
                    + " ORDER BY i.updated_at DESC,i.id LIMIT 20 OFFSET :offset")
            .param("run", id)
            .param("offset", page * 20)
            .query(
                (rs, n) -> {
                  var original = mapItem(rs, n);
                  if (!Set.of("AUTO_APPROVED", "APPROVED", "MERGED").contains(original.state())
                      || rs.getString("current_title") == null) return original;
                  return new Item(
                      original.id(),
                      original.runId(),
                      original.songId(),
                      rs.getString("current_title"),
                      rs.getString("current_artist"),
                      original.songVersion(),
                      original.state(),
                      original.revision(),
                      original.attempts(),
                      original.message(),
                      original.updatedAt());
                })
            .list();
    return new Page(list, total, page, 20);
  }

  @Transactional(readOnly = true)
  public Detail detail(String actor, UUID id) {
    catalog.admin(actor);
    var current = item(id);
    var list =
        jdbc.sql("SELECT * FROM singflow.catalog_sync_candidates WHERE item_id=? ORDER BY position")
            .param(id)
            .query(
                (rs, n) ->
                    new Candidate(
                        rs.getInt("position"),
                        rs.getString("title"),
                        rs.getString("artist"),
                        rs.getString("lastfm_url"),
                        rs.getString("lastfm_mbid"),
                        rs.getInt("score"),
                        catalog
                            .target(current.songId(), rs.getString("title"), rs.getString("artist"))
                            .orElse(null)))
            .list();
    return new Detail(current, list);
  }

  private void reviewable(Item current, long revision) {
    if (current.revision() != revision || !Set.of("REVIEW", "FAILED").contains(current.state()))
      throw conflict("O resultado mudou. Atualize a revisão.");
    var song = catalog.get(current.songId());
    if (!song.status().equals("PENDING") || song.version() != current.songVersion())
      throw conflict("O cadastro foi alterado ou aprovado. Consulte novamente antes de revisar.");
  }

  public record Refinement(Item item, String title, String artist) {}

  @Transactional
  public Refinement refinement(String actor, UUID id, long revision, String title, String artist) {
    catalog.admin(actor);
    catalog.lock();
    var current = item(id);
    reviewable(current, revision);
    return new Refinement(current, catalog.clean(title, true), catalog.clean(artist, false));
  }

  @Transactional
  public Detail refined(String actor, Refinement query, List<SongSearch.Song> results) {
    catalog.admin(actor);
    catalog.lock();
    var current = item(query.item().id());
    reviewable(current, query.item().revision());
    var ranked = SyncMatching.rank(query.title(), query.artist(), results);
    jdbc.sql("DELETE FROM singflow.catalog_sync_candidates WHERE item_id=?")
        .param(current.id())
        .update();
    for (int position = 0; position < ranked.size(); position++) {
      var match = ranked.get(position);
      jdbc.sql("INSERT INTO singflow.catalog_sync_candidates VALUES(?,?,?,?,?,?,?)")
          .params(
              current.id(),
              position,
              match.title(),
              match.artist(),
              SongSearch.safeUrl(match.url()),
              SongSearch.safeMbid(match.mbid()),
              SyncMatching.score(query.title(), query.artist(), match))
          .update();
    }
    finishItem(
        current,
        "REVIEW",
        ranked.isEmpty()
            ? "Nenhuma correspondência encontrada na nova busca. Você pode usar os dados manuais."
            : "Correspondências atualizadas com os dados informados. Confirme a opção antes de"
                + " aprovar.");
    audit(current.runId(), current.id(), actor, "QUERY_REFINED");
    return detail(actor, current.id());
  }

  private Preview preview(Item current, Choice choice) {
    reviewable(current, choice.revision());
    String title, artist, url = "", mbid = "";
    if (choice.position() != null) {
      var candidate =
          jdbc.sql("SELECT * FROM singflow.catalog_sync_candidates WHERE item_id=? AND position=?")
              .params(current.id(), choice.position())
              .query(
                  (rs, n) ->
                      new SongSearch.Song(
                          rs.getString("title"),
                          rs.getString("artist"),
                          rs.getString("lastfm_url"),
                          rs.getString("lastfm_mbid")))
              .optional()
              .orElseThrow(
                  () ->
                      new ResponseStatusException(
                          HttpStatus.BAD_REQUEST, "Escolha uma correspondência válida."));
      title = candidate.title();
      artist = candidate.artist();
      url = candidate.url();
      mbid = candidate.mbid();
    } else {
      title = catalog.clean(choice.title(), true);
      artist = catalog.clean(choice.artist(), true);
    }
    var existing = catalog.target(current.songId(), title, artist).orElse(null);
    if (existing != null && !Set.of("PENDING", "APPROVED").contains(existing.status()))
      throw conflict(
          "O cadastro correspondente está rejeitado. Revise-o no catálogo antes de vincular.");
    return new Preview(current, title, artist, url, mbid, existing);
  }

  @Transactional
  public Preview preview(String actor, UUID id, Choice choice) {
    catalog.admin(actor);
    catalog.lock();
    return preview(item(id), choice);
  }

  @Transactional
  public Detail approve(String actor, UUID id, Choice choice, UUID targetId, Long targetVersion) {
    catalog.admin(actor);
    catalog.lock();
    var current = item(id);
    var selected = preview(current, choice);
    var result =
        catalog.reconcile(
            actor,
            current.songId(),
            current.songVersion(),
            selected.title(),
            selected.artist(),
            selected.url(),
            selected.mbid(),
            targetId,
            targetVersion,
            false);
    finishItem(
        current,
        result.merged() ? "MERGED" : "APPROVED",
        result.merged()
            ? "Vínculo e aprovação confirmados pelo administrador."
            : "Aprovação confirmada pelo administrador.");
    jdbc.sql("UPDATE singflow.catalog_sync_items SET reviewed_by=? WHERE id=?")
        .params(actor, id)
        .update();
    audit(
        current.runId(),
        id,
        actor,
        choice.position() == null ? "MANUAL_APPROVED" : "MATCH_APPROVED");
    return detail(actor, id);
  }

  @Transactional
  public Detail retry(String actor, UUID id, long revision) {
    catalog.admin(actor);
    catalog.lock();
    var current = item(id);
    if (current.revision() != revision
        || !Set.of("REVIEW", "FAILED", "SKIPPED").contains(current.state()))
      throw conflict("O item mudou. Atualize o acompanhamento.");
    var song = catalog.get(current.songId());
    if (!song.status().equals("PENDING")) throw conflict("A música já foi revisada no catálogo.");
    if (active().filter(run -> !run.equals(current.runId())).isPresent())
      throw conflict(
          "Outro lote está em andamento. Aguarde a conclusão antes de repetir esta consulta.");
    jdbc.sql("DELETE FROM singflow.catalog_sync_candidates WHERE item_id=?").param(id).update();
    jdbc.sql(
            "UPDATE singflow.catalog_sync_items SET"
                + " state='QUEUED',title=?,artist=?,song_version=?,attempts=0,revision=revision+1,message='',claim_token=NULL,lease_until=NULL,next_attempt_at=clock_timestamp(),updated_at=clock_timestamp()"
                + " WHERE id=?")
        .params(song.title(), song.artist(), song.version(), id)
        .update();
    jdbc.sql(
            "UPDATE singflow.catalog_sync_runs SET"
                + " status='RUNNING',runner=?,message='',updated_at=clock_timestamp() WHERE id=?")
        .params(actor, current.runId())
        .update();
    audit(current.runId(), id, actor, "RETRIED");
    return detail(actor, id);
  }

  private void settle(UUID id) {
    jdbc.sql(
            "UPDATE singflow.catalog_sync_runs SET status='COMPLETED',updated_at=clock_timestamp()"
                + " WHERE id=? AND status IN ('RUNNING','PAUSED') AND NOT EXISTS(SELECT 1 FROM"
                + " singflow.catalog_sync_items WHERE run_id=? AND state IN"
                + " ('QUEUED','PROCESSING'))")
        .params(id, id)
        .update();
  }

  private boolean authorized(UUID run) {
    String actor =
        jdbc.sql("SELECT runner FROM singflow.catalog_sync_runs WHERE id=?")
            .param(run)
            .query(String.class)
            .single();
    boolean valid = accounts.find(actor).map(a -> a.active() && a.administrator()).orElse(false);
    if (!valid)
      jdbc.sql(
              "UPDATE singflow.catalog_sync_runs SET status='PAUSED',message='Permissão"
                  + " administrativa de quem iniciou ou retomou foi"
                  + " alterada.',updated_at=clock_timestamp() WHERE id=?")
          .param(run)
          .update();
    return valid;
  }

  @Transactional
  public Optional<Claim> claim() {
    catalog.lock();
    var current =
        jdbc.sql(
                "SELECT * FROM singflow.catalog_sync_runs WHERE status='RUNNING' ORDER BY"
                    + " created_at LIMIT 1")
            .query(this::mapRun)
            .optional();
    if (current.isEmpty()) return Optional.empty();
    var run = current.get();
    if (!authorized(run.id())) return Optional.empty();
    jdbc.sql(
            "UPDATE singflow.catalog_sync_items SET"
                + " state='QUEUED',claim_token=NULL,lease_until=NULL,message='Retomando consulta"
                + " interrompida.',updated_at=clock_timestamp() WHERE run_id=? AND"
                + " state='PROCESSING' AND lease_until<clock_timestamp()")
        .param(run.id())
        .update();
    var next =
        jdbc.sql(
                "SELECT * FROM singflow.catalog_sync_items WHERE run_id=? AND state='QUEUED' AND"
                    + " next_attempt_at<=clock_timestamp() ORDER BY created_at,id LIMIT 1")
            .param(run.id())
            .query(this::mapItem)
            .optional();
    if (next.isEmpty()) {
      settle(run.id());
      return Optional.empty();
    }
    if (next.get().attempts() >= 3) {
      finishItem(
          next.get(),
          "FAILED",
          "Consulta interrompida três vezes. Você pode tentar novamente ou revisar manualmente.");
      settle(run.id());
      return Optional.empty();
    }
    var song = catalog.get(next.get().songId());
    if (!song.status().equals("PENDING") || song.version() != next.get().songVersion()) {
      finishItem(
          next.get(),
          "SKIPPED",
          "O cadastro foi alterado fora da sincronização. Nenhuma alteração aplicada.");
      settle(run.id());
      return Optional.empty();
    }
    UUID token = UUID.randomUUID();
    jdbc.sql(
            "UPDATE singflow.catalog_sync_items SET"
                + " state='PROCESSING',claim_token=?,lease_until=clock_timestamp()+interval '2"
                + " minutes',revision=revision+1,attempts=attempts+1,message='Consultando"
                + " Last.fm…',updated_at=clock_timestamp() WHERE id=?")
        .params(token, next.get().id())
        .update();
    return Optional.of(new Claim(item(next.get().id()), token));
  }

  private boolean validClaim(Claim claim) {
    return jdbc.sql(
            "SELECT EXISTS(SELECT 1 FROM singflow.catalog_sync_items WHERE id=? AND"
                + " state='PROCESSING' AND claim_token=? AND lease_until>clock_timestamp())")
        .params(claim.item().id(), claim.token())
        .query(Boolean.class)
        .single();
  }

  private boolean canComplete(Claim claim) {
    if (!validClaim(claim)) return false;
    if (!run(claim.item().runId()).status().equals("RUNNING")
        || !authorized(claim.item().runId())) {
      jdbc.sql(
              "UPDATE singflow.catalog_sync_items SET"
                  + " state='QUEUED',claim_token=NULL,lease_until=NULL,message='Consulta"
                  + " pausada.',revision=revision+1,updated_at=clock_timestamp() WHERE id=?")
          .param(claim.item().id())
          .update();
      return false;
    }
    return true;
  }

  private void finishItem(Item current, String state, String message) {
    jdbc.sql(
            "UPDATE singflow.catalog_sync_items SET"
                + " state=?,message=?,claim_token=NULL,lease_until=NULL,revision=revision+1,updated_at=clock_timestamp()"
                + " WHERE id=?")
        .params(state, message, current.id())
        .update();
    jdbc.sql("UPDATE singflow.catalog_sync_runs SET updated_at=clock_timestamp() WHERE id=?")
        .param(current.runId())
        .update();
  }

  @Transactional
  public void complete(Claim claim, List<SongSearch.Song> results) {
    catalog.lock();
    if (!canComplete(claim)) return;
    var current = item(claim.item().id());
    var song = catalog.get(current.songId());
    if (!song.status().equals("PENDING") || song.version() != current.songVersion()) {
      finishItem(
          current,
          "SKIPPED",
          "O cadastro foi alterado durante a consulta. Nenhuma alteração aplicada.");
      settle(current.runId());
      return;
    }
    var ranked = SyncMatching.rank(current.title(), current.artist(), results);
    jdbc.sql("DELETE FROM singflow.catalog_sync_candidates WHERE item_id=?")
        .param(current.id())
        .update();
    for (int i = 0; i < ranked.size(); i++) {
      var candidate = ranked.get(i);
      jdbc.sql("INSERT INTO singflow.catalog_sync_candidates VALUES(?,?,?,?,?,?,?)")
          .params(
              current.id(),
              i,
              candidate.title(),
              candidate.artist(),
              SongSearch.safeUrl(candidate.url()),
              SongSearch.safeMbid(candidate.mbid()),
              SyncMatching.score(current.title(), current.artist(), candidate))
          .update();
    }
    var exact =
        ranked.stream()
            .filter(c -> SyncMatching.exact(current.title(), current.artist(), c))
            .toList();
    if (exact.size() == 1
        && catalog
            .target(current.songId(), exact.getFirst().title(), exact.getFirst().artist())
            .isEmpty()) {
      var match = exact.getFirst();
      String actor =
          jdbc.sql("SELECT runner FROM singflow.catalog_sync_runs WHERE id=?")
              .param(current.runId())
              .query(String.class)
              .single();
      catalog.reconcile(
          actor,
          current.songId(),
          current.songVersion(),
          match.title(),
          match.artist(),
          match.url(),
          match.mbid(),
          null,
          null,
          true);
      finishItem(current, "AUTO_APPROVED", "Título e artista exatos: aprovação automática.");
      audit(current.runId(), current.id(), actor, "AUTO_APPROVED");
    } else
      finishItem(
          current,
          "REVIEW",
          ranked.isEmpty()
              ? "Nenhuma correspondência encontrada. Edite os dados para aprovar."
              : "Confira as correspondências e escolha ou edite os dados.");
    settle(current.runId());
  }

  @Transactional
  public void failed(Claim claim, boolean rateLimited) {
    catalog.lock();
    if (!canComplete(claim)) return;
    var current = item(claim.item().id());
    if (current.attempts() < 3) {
      jdbc.sql(
              "UPDATE singflow.catalog_sync_items SET"
                  + " state='QUEUED',claim_token=NULL,lease_until=NULL,revision=revision+1,next_attempt_at=clock_timestamp()+(?"
                  + " * interval '1 second'),message='Consulta indisponível. Nova tentativa"
                  + " agendada.',updated_at=clock_timestamp() WHERE id=?")
          .params(rateLimited ? 90 : 30, current.id())
          .update();
    } else
      finishItem(
          current,
          "FAILED",
          "Consulta indisponível após três tentativas. Você pode tentar novamente ou revisar"
              + " manualmente.");
    settle(current.runId());
  }
}
