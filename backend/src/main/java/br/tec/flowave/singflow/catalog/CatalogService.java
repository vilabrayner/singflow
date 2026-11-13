package br.tec.flowave.singflow.catalog;

import br.tec.flowave.singflow.identity.AccountLifecycle;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CatalogService {
  public record Song(
      UUID id,
      String title,
      String artist,
      String status,
      String source,
      UUID mergedInto,
      long version,
      Instant createdAt,
      Instant updatedAt) {}

  public record Page(List<Song> items, long total, int page, int size) {}

  public record Event(
      String actor,
      String action,
      String reason,
      String beforeState,
      String afterState,
      Instant occurredAt) {}

  private final JdbcClient jdbc;
  private final AccountLifecycle accounts;
  private final LastfmChoices choices;

  public CatalogService(JdbcClient jdbc, AccountLifecycle accounts, LastfmChoices choices) {
    this.jdbc = jdbc;
    this.accounts = accounts;
    this.choices = choices;
  }

  private Song map(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
    return new Song(
        rs.getObject("id", UUID.class),
        rs.getString("title"),
        rs.getString("artist"),
        rs.getString("status"),
        rs.getString("source"),
        rs.getObject("merged_into", UUID.class),
        rs.getLong("version"),
        rs.getTimestamp("created_at").toInstant(),
        rs.getTimestamp("updated_at").toInstant());
  }

  private ResponseStatusException conflict(String text) {
    return new ResponseStatusException(HttpStatus.CONFLICT, text);
  }

  void admin(String actor) {
    var account = accounts.get(actor);
    if (!account.active() || !account.administrator())
      throw new ResponseStatusException(HttpStatus.FORBIDDEN);
  }

  // All catalog writers acquire this transaction-scoped lock. Admin changes never lock sessions,
  // requests or stage calls, avoiding a reverse lock dependency during live karaoke operations.
  void lock() {
    jdbc.sql("SELECT pg_advisory_xact_lock(731406221)").query((rs, n) -> true).single();
  }

  String clean(String value, boolean required) {
    String text = value == null ? "" : value.strip();
    if ((required && text.isBlank()) || text.length() > 160)
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Confira música e artista (até 160 caracteres).");
    return text;
  }

  Optional<UUID> alias(String title, String artist) {
    return jdbc.sql(
            "SELECT singflow.catalog_root(song_id) FROM singflow.catalog_aliases WHERE"
                + " title_key=singflow.catalog_key(?) AND artist_key=singflow.catalog_key(?)")
        .params(title, artist)
        .query(UUID.class)
        .optional();
  }

  void alias(UUID id, String title, String artist) {
    jdbc.sql(
            "INSERT INTO singflow.catalog_aliases"
                + " VALUES(singflow.catalog_key(?),singflow.catalog_key(?),?) ON CONFLICT DO"
                + " NOTHING")
        .params(title, artist, id)
        .update();
  }

  Song get(UUID id) {
    return jdbc.sql("SELECT * FROM singflow.catalog_songs WHERE id=?")
        .param(id)
        .query(this::map)
        .optional()
        .orElseThrow(
            () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Música não encontrada."));
  }

  String snapshot(UUID id) {
    return jdbc.sql("SELECT to_jsonb(s)::text FROM singflow.catalog_songs s WHERE id=?")
        .param(id)
        .query(String.class)
        .single();
  }

  void audit(UUID id, String actor, String action, String reason, String before) {
    jdbc.sql(
            "INSERT INTO"
                + " singflow.catalog_audit(id,song_id,actor,action,reason,before_state,after_state)"
                + " VALUES(?,?,?,?,?,cast(? AS jsonb),cast(? AS jsonb))")
        .params(UUID.randomUUID(), id, actor, action, reason, before, snapshot(id))
        .update();
  }

  private Song insert(
      UUID id, String title, String artist, String source, String status, String actor) {
    jdbc.sql("INSERT INTO singflow.catalog_songs(id,title,artist,source,status) VALUES(?,?,?,?,?)")
        .params(id, title, artist, source, status)
        .update();
    alias(id, title, artist);
    audit(id, actor, "CREATED", "", null);
    return get(id);
  }

  /** Resolve aliases without changing the immutable title/artist snapshots on a request. */
  @Transactional(propagation = Propagation.MANDATORY)
  public UUID register(String title, String artist, String actor) {
    title = clean(title, true);
    artist = clean(artist, false);
    lock();
    var existing = alias(title, artist);
    return existing.isPresent() ? existing.get() : createProvisional(title, artist, actor);
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public UUID register(String title, String artist, String actor, String selectionToken) {
    if (selectionToken == null || selectionToken.isBlank()) return register(title, artist, actor);
    var selected = choices.require(selectionToken, title, artist);
    lock();
    UUID id = register(selected.title(), selected.artist(), actor);
    var song = get(id);
    if (song.status().equals("REJECTED"))
      throw conflict("Esta música foi rejeitada no catálogo. Solicite a revisão ao administrador.");
    if (!song.status().equals("APPROVED")) {
      String before = snapshot(id);
      jdbc.sql(
              "UPDATE singflow.catalog_songs SET"
                  + " title=?,artist=?,status='APPROVED',lastfm_url=nullif(?,''),lastfm_mbid=nullif(?,''),version=version+1,updated_at=now()"
                  + " WHERE id=?")
          .params(selected.title(), selected.artist(), selected.url(), selected.mbid(), id)
          .update();
      alias(id, selected.title(), selected.artist());
      audit(
          id,
          actor,
          "LASTFM_SELECTED",
          "Seleção validada contra resultado emitido pelo backend.",
          before);
    }
    return id;
  }

  public record PublicSong(UUID id, String title, String artist) {}

  public record PublicPage(List<PublicSong> items, long total, int page, int size) {}

  @Transactional(readOnly = true)
  public PublicPage browse(int page) {
    return browse(page, 20);
  }

  @Transactional(readOnly = true)
  public PublicPage browse(int page, int size) {
    if (size != 10 && size != 20) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
    if (page < 0 || page > 100000) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
    long total =
        jdbc.sql("SELECT count(*) FROM singflow.catalog_songs WHERE status='APPROVED'")
            .query(Long.class)
            .single();
    var list =
        jdbc.sql(
                "SELECT id,title,artist FROM singflow.catalog_songs WHERE status='APPROVED' ORDER"
                    + " BY lower(title),lower(artist),id LIMIT ? OFFSET ?")
            .param(size)
            .param(page * size)
            .query(
                (rs, n) ->
                    new PublicSong(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3)))
            .list();
    return new PublicPage(list, total, page, size);
  }

  private UUID createProvisional(String title, String artist, String actor) {
    return insert(UUID.randomUUID(), title, artist, "REQUEST", "PENDING", actor).id();
  }

  @Transactional(readOnly = true)
  public List<Song> approved(String query) {
    return approved(query, 0, 10);
  }

  @Transactional(readOnly = true)
  public List<Song> approved(String query, int page, int size) {
    if (page < 0 || page > 1000 || size < 1 || size > 11)
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
    String q = clean(query, false);
    if (q.length() < 3) return List.of();
    return jdbc.sql(
            "SELECT s.* FROM singflow.catalog_songs s WHERE s.status='APPROVED' AND"
                + " (strpos(singflow.catalog_key(s.title||'"
                + " '||s.artist),singflow.catalog_key(:q))>0 OR EXISTS(SELECT 1 FROM"
                + " singflow.catalog_aliases a WHERE singflow.catalog_root(a.song_id)=s.id AND"
                + " strpos(a.title_key||' '||a.artist_key,singflow.catalog_key(:q))>0)) ORDER BY"
                + " lower(s.title),lower(s.artist),s.id LIMIT :size OFFSET :offset")
        .param("q", q)
        .param("size", size)
        .param("offset", page * 10)
        .query(this::map)
        .list();
  }

  @Transactional(readOnly = true)
  public Page list(String actor, String query, String status, int page) {
    admin(actor);
    String q = clean(query, false);
    if (page < 0
        || page > 100000
        || !Set.of("", "PENDING", "APPROVED", "REJECTED", "MERGED").contains(status))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
    String filter =
        " FROM singflow.catalog_songs WHERE (:status='' OR status=:status) AND"
            + " strpos(singflow.catalog_key(title||' '||artist),singflow.catalog_key(:q))>0";
    long total =
        jdbc.sql("SELECT count(*)" + filter)
            .param("status", status)
            .param("q", q)
            .query(Long.class)
            .single();
    var items =
        jdbc.sql("SELECT *" + filter + " ORDER BY updated_at DESC,id LIMIT 25 OFFSET :offset")
            .param("status", status)
            .param("q", q)
            .param("offset", page * 25)
            .query(this::map)
            .list();
    return new Page(items, total, page, 25);
  }

  @Transactional(readOnly = true)
  public List<Event> history(String actor, UUID id) {
    admin(actor);
    get(id);
    return jdbc.sql(
            "SELECT * FROM singflow.catalog_audit WHERE song_id=? ORDER BY occurred_at DESC,id DESC"
                + " LIMIT 50")
        .param(id)
        .query(
            (rs, n) ->
                new Event(
                    rs.getString("actor"),
                    rs.getString("action"),
                    rs.getString("reason"),
                    rs.getString("before_state"),
                    rs.getString("after_state"),
                    rs.getTimestamp("occurred_at").toInstant()))
        .list();
  }

  private void editable(Song song, long version) {
    if (song.version() != version || song.status().equals("MERGED"))
      throw conflict("A música mudou ou foi unificada. Atualize o catálogo.");
  }

  @Transactional
  public Song create(String actor, UUID operation, String title, String artist) {
    admin(actor);
    title = clean(title, true);
    artist = clean(artist, false);
    lock();
    var previous =
        jdbc.sql("SELECT * FROM singflow.catalog_songs WHERE id=?")
            .param(operation)
            .query(this::map)
            .optional();
    if (previous.isPresent()) {
      var song = previous.get();
      if (!song.source().equals("ADMIN")
          || !song.title().equals(title)
          || !song.artist().equals(artist)) throw conflict("Identificador já utilizado.");
      return song;
    }
    if (alias(title, artist).isPresent())
      throw conflict("Esta música já existe no catálogo. Localize o cadastro para revisá-lo.");
    return insert(operation, title, artist, "ADMIN", "APPROVED", actor);
  }

  @Transactional
  public Song edit(String actor, UUID id, long version, String title, String artist) {
    admin(actor);
    title = clean(title, true);
    artist = clean(artist, false);
    lock();
    var song = get(id);
    editable(song, version);
    var found = alias(title, artist);
    if (found.isPresent() && !found.get().equals(id))
      throw conflict("Já existe outra música com esse título e artista. Use Unificar duplicata.");
    if (song.title().equals(title) && song.artist().equals(artist)) return song;
    String before = snapshot(id);
    alias(id, title, artist);
    jdbc.sql(
            "UPDATE singflow.catalog_songs SET title=?,artist=?,version=version+1,updated_at=now()"
                + " WHERE id=?")
        .params(title, artist, id)
        .update();
    audit(id, actor, "EDITED", "", before);
    return get(id);
  }

  @Transactional
  public Song review(String actor, UUID id, long version, String status, String reason) {
    admin(actor);
    lock();
    var song = get(id);
    editable(song, version);
    if (!Set.of("APPROVED", "REJECTED").contains(status)
        || reason == null
        || reason.length() > 500
        || (status.equals("REJECTED") && reason.isBlank()))
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Informe a decisão e o motivo da rejeição.");
    if (song.status().equals(status)) return song;
    String before = snapshot(id);
    jdbc.sql(
            "UPDATE singflow.catalog_songs SET status=?,version=version+1,updated_at=now() WHERE"
                + " id=?")
        .params(status, id)
        .update();
    audit(id, actor, status, reason.strip(), before);
    return get(id);
  }

  @Transactional
  public Song merge(
      String actor, UUID id, long version, UUID target, long targetVersion, String reason) {
    admin(actor);
    lock();
    var source = get(id);
    var destination = get(target);
    editable(source, version);
    editable(destination, targetVersion);
    if (id.equals(target)
        || destination.status().equals("REJECTED")
        || reason == null
        || reason.isBlank()
        || reason.length() > 500)
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Escolha outra música ativa e informe o motivo.");
    String before = snapshot(id);
    jdbc.sql(
            "UPDATE singflow.catalog_songs SET"
                + " status='MERGED',merged_into=?,version=version+1,updated_at=now() WHERE id=?")
        .params(target, id)
        .update();
    audit(id, actor, "MERGED", reason.strip(), before);
    return get(id);
  }

  record Resolution(Song song, boolean merged) {}

  Optional<Song> target(UUID source, String title, String artist) {
    return alias(title, artist).filter(id -> !id.equals(source)).map(this::get);
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public Resolution reconcile(
      String actor,
      UUID source,
      long expectedVersion,
      String title,
      String artist,
      String url,
      String mbid,
      UUID expectedTarget,
      Long targetVersion,
      boolean automatic) {
    admin(actor);
    lock();
    var original = get(source);
    if (!original.status().equals("PENDING") || original.version() != expectedVersion)
      throw conflict("A música foi alterada. Consulte novamente antes de aprovar.");
    title = clean(title, true);
    artist = clean(artist, true);
    var duplicate = target(source, title, artist);
    if (duplicate.isPresent()) {
      var destination = duplicate.get();
      if (automatic
          || expectedTarget == null
          || !destination.id().equals(expectedTarget)
          || targetVersion == null
          || destination.version() != targetVersion
          || destination.status().equals("REJECTED")
          || destination.status().equals("MERGED"))
        throw conflict(
            "A correspondência possui outro cadastro. Confira o vínculo antes de aprovar.");
      String before = snapshot(destination.id());
      jdbc.sql(
              "UPDATE singflow.catalog_songs SET"
                  + " status='APPROVED',lastfm_url=coalesce(nullif(?,''),lastfm_url),lastfm_mbid=coalesce(nullif(?,''),lastfm_mbid),version=version+1,updated_at=now()"
                  + " WHERE id=?")
          .params(SongSearch.safeUrl(url), SongSearch.safeMbid(mbid), destination.id())
          .update();
      audit(destination.id(), actor, "SYNC_APPROVED", "Revisão assistida pelo Last.fm.", before);
      before = snapshot(source);
      jdbc.sql(
              "UPDATE singflow.catalog_songs SET"
                  + " status='MERGED',merged_into=?,version=version+1,updated_at=now() WHERE id=?")
          .params(destination.id(), source)
          .update();
      audit(source, actor, "SYNC_LINKED", "Vínculo confirmado na sincronização.", before);
      return new Resolution(get(destination.id()), true);
    }
    if (expectedTarget != null) throw conflict("O destino mudou. Atualize a correspondência.");
    String before = snapshot(source);
    alias(source, title, artist);
    jdbc.sql(
            "UPDATE singflow.catalog_songs SET"
                + " title=?,artist=?,status='APPROVED',lastfm_url=coalesce(nullif(?,''),lastfm_url),lastfm_mbid=coalesce(nullif(?,''),lastfm_mbid),version=version+1,updated_at=now()"
                + " WHERE id=?")
        .params(title, artist, SongSearch.safeUrl(url), SongSearch.safeMbid(mbid), source)
        .update();
    audit(
        source,
        actor,
        automatic ? "SYNC_AUTO_APPROVED" : "SYNC_APPROVED",
        automatic
            ? "Título e artista exatos no Last.fm."
            : "Revisão confirmada pelo administrador.",
        before);
    return new Resolution(get(source), false);
  }
}
