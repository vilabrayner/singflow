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
      Instant updatedAt, String originalKey) {}

  public record Page(List<Song> items, long total, int page, int size) {}

  public record Event(
      String actor,
      String action,
      String reason,
      String beforeState,
      String afterState,
      Instant occurredAt) {}

  private final JdbcClient jdbc;
  private final org.springframework.context.ApplicationEventPublisher events;
  private final AccountLifecycle accounts;
  private final LastfmChoices choices;

  public CatalogService(JdbcClient jdbc, AccountLifecycle accounts, LastfmChoices choices, org.springframework.context.ApplicationEventPublisher events) {
    this.jdbc = jdbc;
    this.events = events;
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
        rs.getTimestamp("updated_at").toInstant(),rs.getString("original_key"));
  }

  private ResponseStatusException conflict(String text) {
    return new ResponseStatusException(HttpStatus.CONFLICT, text);
  }

  void admin(String actor) {
    var account = accounts.get(actor);
    if (!account.active() || !account.administrator())
      throw new ResponseStatusException(HttpStatus.FORBIDDEN);
  }

  // Lock order: session (when relevant), catalogue advisory lock, then request/call rows.
  // Catalogue consolidation never takes session locks.
  void lock() {
    jdbc.sql("SELECT pg_advisory_xact_lock(731406221)").query((rs, n) -> true).single();
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public void lockReferences() { lock(); }

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
        .optional().filter(id -> !deleted(id));
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
                + " singflow.catalog_audit(id,song_id,original_song_id,actor,action,reason,before_state,after_state)"
                + " VALUES(?,?,?,?,?,?,cast(? AS jsonb),cast(? AS jsonb))")
        .params(UUID.randomUUID(), id, id, actor, action, reason, before, snapshot(id))
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

  /** Resolve aliases to the single canonical song used by requests and performances. */
  @Transactional(propagation = Propagation.MANDATORY)
  public UUID register(String title, String artist, String actor) {
    title = clean(title, true);
    artist = clean(artist, false);
    lock();
    var existing = alias(title, artist);
    if(existing.isPresent())return existing.get();
    UUID id=createProvisional(title,artist,actor);
    events.publishEvent(new SongEnrichmentRequested(id));
    return id;
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
        jdbc.sql("SELECT count(*) FROM singflow.catalog_songs WHERE status='APPROVED' AND deleted_at IS NULL")
            .query(Long.class)
            .single();
    var list =
        jdbc.sql(
                "SELECT id,title,artist FROM singflow.catalog_songs WHERE status='APPROVED' AND deleted_at IS NULL ORDER"
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
            "SELECT s.* FROM singflow.catalog_songs s WHERE s.status='APPROVED' AND s.deleted_at IS NULL AND"
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
    return list(actor, query, status, page, 25);
  }

  @Transactional(readOnly = true)
  public Page list(String actor, String query, String status, int page, int size) {
    admin(actor);
    String q = clean(query, false);
    if (!Set.of(10, 25).contains(size) || page < 0
        || page > 100000
        || !Set.of("", "PENDING", "APPROVED", "REJECTED", "MERGED").contains(status))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
    String filter =
        " FROM singflow.catalog_songs WHERE deleted_at IS NULL AND status<>'MERGED' AND (:status='' OR status=:status) AND"
            + " strpos(singflow.catalog_key(title||' '||artist),singflow.catalog_key(:q))>0";
    long total =
        jdbc.sql("SELECT count(*)" + filter)
            .param("status", status)
            .param("q", q)
            .query(Long.class)
            .single();
    var items =
        jdbc.sql("SELECT *" + filter + " ORDER BY lower(title),lower(artist),id LIMIT :size OFFSET :offset")
            .param("status", status)
            .param("q", q)
            .param("size", size)
            .param("offset", page * size)
            .query(this::map)
            .list();
    return new Page(items, total, page, size);
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
    if (deleted(song.id()) || song.version() != version || song.status().equals("MERGED"))
      throw conflict("A música mudou ou foi unificada. Atualize o catálogo.");
  }

  @Transactional
  public Song create(String actor, UUID operation, String title, String artist) {
    admin(actor);
    title = clean(title, true);
    artist = clean(artist, false);
    lock();
    if (jdbc.sql("SELECT EXISTS(SELECT 1 FROM singflow.catalog_redirects WHERE source_id=?)").param(operation).query(Boolean.class).single()) throw conflict("Este cadastro foi unificado. Localize a música definitiva.");
    var previous =
        jdbc.sql("SELECT * FROM singflow.catalog_songs WHERE id=?")
            .param(operation)
            .query(this::map)
            .optional();
    if (previous.isPresent()) {
      var song = previous.get();
      if (deleted(song.id())) throw conflict("A música foi excluída. Inicie um novo cadastro.");
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
  public Song editWithKey(String actor,UUID id,long version,String title,String artist,String key) {
    key=MusicKey.normalize(key);
    var song=edit(actor,id,version,title,artist);
    return setOriginalKey(actor,id,song.version(),key);
  }
  @Transactional
  public Song createWithKey(String actor,UUID operation,String title,String artist,String key) {
    key=MusicKey.normalize(key);
    var song=create(actor,operation,title,artist);
    return setOriginalKey(actor,song.id(),song.version(),key);
  }

  @Transactional
  public Song setOriginalKey(String actor,UUID id,long version,String key) {
    admin(actor); lock();
    var song=get(id); editable(song,version);
    key=MusicKey.normalize(key);
    if(Objects.equals(key,song.originalKey())) return song;
    String before=snapshot(id);
    jdbc.sql("UPDATE singflow.catalog_songs SET original_key=?,version=version+1,updated_at=now() WHERE id=?").params(key,id).update();
    audit(id,actor,"KEY_CHANGED","Tom original atualizado.",before);
    return get(id);
  }

  /** Transfer every FK while retaining source identity in audit/operation evidence. */
  private void consolidate(String actor,UUID source,UUID target,String reason) {
    String before=snapshot(source);
    audit(source,actor,"MERGED",reason,before);
    jdbc.sql("UPDATE singflow.catalog_songs d SET original_key=coalesce(d.original_key,s.original_key),spotify_url=coalesce(d.spotify_url,s.spotify_url),youtube_url=coalesce(d.youtube_url,s.youtube_url),lyrics_url=coalesce(d.lyrics_url,s.lyrics_url),chords_url=coalesce(d.chords_url,s.chords_url),lastfm_url=coalesce(d.lastfm_url,s.lastfm_url),lastfm_mbid=coalesce(d.lastfm_mbid,s.lastfm_mbid),version=d.version+1,updated_at=now() FROM singflow.catalog_songs s WHERE d.id=? AND s.id=?").params(target,source).update();
    jdbc.sql("UPDATE singflow.catalog_redirects SET target_id=? WHERE target_id=?").params(target,source).update();
    jdbc.sql("INSERT INTO singflow.catalog_redirects(source_id,target_id) VALUES(?,?)").params(source,target).update();
    jdbc.sql("UPDATE singflow.song_requests SET catalog_song_id=?,settings_version=settings_version+1 WHERE catalog_song_id=?").params(target,source).update();
    jdbc.sql("UPDATE singflow.stage_calls SET catalog_song_id=? WHERE catalog_song_id=?").params(target,source).update();
    jdbc.sql("UPDATE singflow.catalog_aliases SET song_id=? WHERE song_id=?").params(target,source).update();
    jdbc.sql("UPDATE singflow.catalog_audit SET song_id=? WHERE song_id=?").params(target,source).update();
    jdbc.sql("UPDATE singflow.catalog_import_operations SET song_id=? WHERE song_id=?").params(target,source).update();
    jdbc.sql("UPDATE singflow.catalog_sync_items SET song_id=?,revision=revision+1 WHERE song_id=?").params(target,source).update();
    jdbc.sql("""
        INSERT INTO singflow.musician_chord_preferences AS destination(account_id,song_id,url,version,alternatives)
        SELECT account_id,?,url,version+1,alternatives FROM singflow.musician_chord_preferences WHERE song_id=?
        ON CONFLICT(account_id,song_id) DO UPDATE SET
          url=coalesce(destination.url,excluded.url),version=destination.version+1,
          alternatives=destination.alternatives || excluded.alternatives ||
            CASE WHEN destination.url IS NOT NULL AND excluded.url IS NOT NULL AND destination.url<>excluded.url
              THEN jsonb_build_array(excluded.url) ELSE '[]'::jsonb END,
          updated_at=clock_timestamp()
        """).params(target,source).update();
    jdbc.sql("UPDATE singflow.musician_chord_audit SET song_id=? WHERE song_id=?").params(target,source).update();
    jdbc.sql("DELETE FROM singflow.musician_chord_preferences WHERE song_id=?").param(source).update();
    jdbc.sql("DELETE FROM singflow.catalog_enrichment_candidates WHERE song_id=? AND provider IN (SELECT provider FROM singflow.catalog_enrichment_jobs WHERE song_id=?)").params(target,source).update();
    jdbc.sql("""
      INSERT INTO singflow.catalog_enrichment_jobs(song_id,provider,title,artist,state)
      SELECT ?,j.provider,s.title,s.artist,CASE WHEN s.artist='' THEN 'WAITING_METADATA' ELSE 'QUEUED' END
      FROM singflow.catalog_enrichment_jobs j JOIN singflow.catalog_songs s ON s.id=? WHERE j.song_id=?
      ON CONFLICT(song_id,provider) DO UPDATE SET title=excluded.title,artist=excluded.artist,state=excluded.state,attempts=0,
        claim_token=NULL,lease_until=NULL,next_attempt_at=clock_timestamp(),message='',updated_at=clock_timestamp()
      """).params(target,target,source).update();
    jdbc.sql("DELETE FROM singflow.catalog_enrichment_jobs WHERE song_id=?").param(source).update();
    jdbc.sql("DELETE FROM singflow.catalog_songs WHERE id=?").param(source).update();
    audit(target,actor,"ABSORBED",reason,before);
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
    if (!destination.status().equals("APPROVED")) throw conflict("Escolha uma música aprovada como destino.");
    consolidate(actor,id,target,reason.strip());
    return get(target);
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
    if (deleted(source) || !original.status().equals("PENDING") || original.version() != expectedVersion)
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
          || deleted(destination.id())
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
      consolidate(actor,source,destination.id(),"Vínculo confirmado na sincronização.");
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

  boolean deleted(UUID id) {
    return jdbc.sql("SELECT deleted_at IS NOT NULL FROM singflow.catalog_songs WHERE id=?")
        .param(id).query(Boolean.class).single();
  }

  @Transactional(readOnly = true)
  public Song details(String actor, UUID id) {
    admin(actor);
    var song = get(id);
    if (deleted(id)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Música excluída do catálogo.");
    return song;
  }

  @Transactional
  public void delete(String actor, UUID id, long version) {
    admin(actor);
    lock();
    var song = get(id);
    if (deleted(id) && song.version() == version + 1) return;
    if (deleted(id) || song.version() != version) throw conflict("A música mudou. Atualize o catálogo antes de excluir.");
    boolean associated = jdbc.sql("""
        SELECT EXISTS(SELECT 1 FROM singflow.song_requests WHERE catalog_song_id=:id)
          OR EXISTS(SELECT 1 FROM singflow.stage_calls WHERE catalog_song_id=:id)
          OR EXISTS(SELECT 1 FROM singflow.catalog_sync_items WHERE song_id=:id)
          OR EXISTS(SELECT 1 FROM singflow.musician_chord_preferences WHERE song_id=:id)
          OR EXISTS(SELECT 1 FROM singflow.musician_chord_audit WHERE song_id=:id)
          OR EXISTS(SELECT 1 FROM singflow.catalog_enrichment_jobs WHERE song_id=:id)
          OR EXISTS(SELECT 1 FROM singflow.catalog_redirects WHERE target_id=:id)
          OR EXISTS(SELECT 1 FROM singflow.catalog_songs WHERE merged_into=:id)
          OR EXISTS(SELECT 1 FROM singflow.catalog_songs WHERE id=:id AND merged_into IS NOT NULL)
        """).param("id", id).query(Boolean.class).single();
    if (associated) throw conflict("Esta música possui associações com pedidos, apresentações, sincronizações ou outras músicas e não pode ser excluída.");
    String before = snapshot(id);
    jdbc.sql("UPDATE singflow.catalog_songs SET deleted_at=clock_timestamp(),updated_at=clock_timestamp(),version=version+1 WHERE id=?").param(id).update();
    jdbc.sql("DELETE FROM singflow.catalog_aliases WHERE song_id=?").param(id).update();
    audit(id, actor, "DELETED", "Exclusão de música sem associações.", before);
  }

  @Transactional
  public Song importChoice(String actor, UUID operation, String title, String artist, String token) {
    admin(actor);
    title = clean(title, true); artist = clean(artist, true);
    lock();
    var previous = jdbc.sql("SELECT actor,title,artist,selection_id,song_id FROM singflow.catalog_import_operations WHERE id=?")
        .param(operation).query((rs,n) -> new String[]{rs.getString(1),rs.getString(2),rs.getString(3),rs.getString(4),rs.getString(5)}).optional();
    if (previous.isPresent()) {
      var p = previous.get();
      if (!p[0].equals(actor) || !p[1].equals(title) || !p[2].equals(artist) || !p[3].equals(token)) throw conflict("Identificador de inclusão já utilizado.");
      return details(actor, UUID.fromString(p[4]));
    }
    var choice = choices.require(token, title, artist);
    if (alias(choice.title(), choice.artist()).isEmpty())
      insert(UUID.randomUUID(), choice.title(), choice.artist(), "ADMIN", "PENDING", actor);
    UUID id = register(choice.title(), choice.artist(), actor, token);
    jdbc.sql("INSERT INTO singflow.catalog_import_operations VALUES(?,?,?,?,?,?)")
        .params(operation,actor,id,title,artist,UUID.fromString(token)).update();
    return get(id);
  }

}
