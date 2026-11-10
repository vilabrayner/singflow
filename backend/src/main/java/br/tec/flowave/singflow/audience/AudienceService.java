package br.tec.flowave.singflow.audience;

import br.tec.flowave.singflow.audit.AuditTrail;
import br.tec.flowave.singflow.participants.*;
import br.tec.flowave.singflow.requests.AssistedRequests;
import br.tec.flowave.singflow.sessions.SessionAccess;
import br.tec.flowave.singflow.stage.StageService;
import java.net.URI;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AudienceService {
  public record EntryLink(String url) {}

  public record EntryInfo(String name, String status) {}

  public record Grant(UUID id, UUID participantId, Instant expiresAt, String departure) {}

  public record Prepared(String token, Instant expiresAt) {}

  public record OwnView(
      SessionAccess.SessionView session,
      Participation.ParticipantView participant,
      List<AssistedRequests.RequestView> requests,
      StageService.CallView active,
      List<StageService.CallView> history,
      boolean suggested,
      Instant expiresAt,
      boolean canReturn) {}

  private final JdbcClient jdbc;
  private final SessionAccess sessions;
  private final Participation participants;
  private final AssistedRequests requests;
  private final StageService stage;
  private final AuditTrail audit;
  private final String appUrl;
  private final SecureRandom random = new SecureRandom();

  public AudienceService(
      JdbcClient jdbc,
      SessionAccess sessions,
      Participation participants,
      AssistedRequests requests,
      StageService stage,
      AuditTrail audit,
      @Value("${SINGFLOW_PUBLIC_APP_URL:http://127.0.0.1:4200}") String appUrl) {
    this.jdbc = jdbc;
    this.sessions = sessions;
    this.participants = participants;
    this.requests = requests;
    this.stage = stage;
    this.audit = audit;
    URI uri = URI.create(appUrl);
    boolean loopback =
        Set.of("localhost", "127.0.0.1", "[::1]")
            .contains(uri.getHost() == null ? "" : uri.getHost());
    if (uri.getHost() == null
        || uri.getRawUserInfo() != null
        || uri.getRawQuery() != null
        || uri.getRawFragment() != null
        || !Set.of("", "/").contains(uri.getPath())
        || !("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()) && loopback))
      throw new IllegalArgumentException(
          "SINGFLOW_PUBLIC_APP_URL deve ser uma origem HTTPS (ou HTTP em loopback).");
    this.appUrl = appUrl.replaceAll("/+$", "");
  }

  private String token() {
    byte[] bytes = new byte[32];
    random.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  private ResponseStatusException unavailable() {
    return new ResponseStatusException(
        HttpStatus.UNAUTHORIZED,
        "Acesso indisponível ou expirado. Procure o anfitrião para preservar seu cadastro.");
  }

  private String owner(UUID session, boolean open) {
    return sessions.lockAudienceContext(session, open).owner();
  }

  @Transactional
  public EntryLink entryLink(UUID session, String owner, UUID rotation) {
    sessions.lockOwned(session, owner, false);
    var rows =
        jdbc.sql("SELECT code,operation_id FROM singflow.entry_links WHERE session_id=?")
            .param(session)
            .query((rs, n) -> Map.entry(rs.getString(1), rs.getObject(2, UUID.class)))
            .list();
    String code;
    if (rows.isEmpty()) {
      code = token();
      jdbc.sql("INSERT INTO singflow.entry_links VALUES (?,?,?)")
          .params(session, code, rotation == null ? UUID.randomUUID() : rotation)
          .update();
      audit.record(owner, session, "ENTRY_LINK_CREATED", session);
    } else if (rotation != null
        && !rotation.equals(rows.getFirst().getValue())
        && !jdbc.sql(
                "SELECT EXISTS(SELECT 1 FROM singflow.entry_link_rotations WHERE operation_id=?)")
            .param(rotation)
            .query(Boolean.class)
            .single()) {
      code = token();
      jdbc.sql("UPDATE singflow.entry_links SET code=?,operation_id=? WHERE session_id=?")
          .params(code, rotation, session)
          .update();
      jdbc.sql("INSERT INTO singflow.entry_link_rotations VALUES (?,?)")
          .params(rotation, session)
          .update();
      audit.record(owner, session, "ENTRY_LINK_ROTATED", session);
    } else code = rows.getFirst().getKey();
    return new EntryLink(appUrl + "/participante/" + session + "/" + code);
  }

  private void checkCode(UUID session, String code) {
    if (code == null
        || !jdbc.sql(
                "SELECT EXISTS(SELECT 1 FROM singflow.entry_links WHERE session_id=? AND code=?)")
            .params(session, code)
            .query(Boolean.class)
            .single())
      throw new ResponseStatusException(
          HttpStatus.NOT_FOUND, "Link de entrada inválido. Peça o QR Code atual ao anfitrião.");
  }

  @Transactional(readOnly = true)
  public EntryInfo info(UUID session, String code) {
    checkCode(session, code);
    var c = sessions.audienceContext(session);
    return new EntryInfo(c.session().name(), c.session().status());
  }

  private Grant grant(UUID session, String raw, boolean requireParticipant) {
    if (raw == null || raw.length() > 128) throw unavailable();
    var found =
        jdbc.sql(
                """
                SELECT id,participant_id,expires_at,departure FROM singflow.participant_grants
                WHERE session_id=? AND token_hash=? AND NOT revoked AND expires_at>now()
                """)
            .params(session, AudienceLimits.hash(raw))
            .query(
                (rs, n) ->
                    new Grant(
                        rs.getObject(1, UUID.class),
                        rs.getObject(2, UUID.class),
                        rs.getTimestamp(3).toInstant(),
                        rs.getString(4)))
            .optional();
    var g = found.orElseThrow(this::unavailable);
    if (requireParticipant && g.participantId() == null) throw unavailable();
    return g;
  }

  @Transactional(readOnly = true)
  public UUID credentialKey(UUID session, String raw) {
    return grant(session, raw, false).id();
  }

  @Transactional
  public Prepared prepare(UUID session, String code, String raw, String browser) {
    owner(session, true);
    if (raw != null) {
      try {
        var g = grant(session, raw, false);
        return new Prepared(raw, g.expiresAt());
      } catch (ResponseStatusException ignored) {
        /* Try browser binding, never name matching. */
      }
    }
    checkCode(session, code);
    String browserHash = AudienceLimits.hash(browser);
    var previous =
        jdbc.sql(
                "SELECT expires_at,revoked FROM singflow.participant_grants WHERE session_id=? AND"
                    + " browser_hash=?")
            .params(session, browserHash)
            .query((rs, n) -> Map.entry(rs.getTimestamp(1).toInstant(), rs.getBoolean(2)))
            .optional();
    if (previous.isPresent()
        && (previous.get().getValue() || !previous.get().getKey().isAfter(Instant.now())))
      throw new ResponseStatusException(
          HttpStatus.GONE,
          "Seu acesso terminou. Procure o anfitrião para retornar sem duplicar o cadastro.");
    String next = token();
    Instant expiry =
        previous.map(Map.Entry::getKey).orElseGet(() -> Instant.now().plusSeconds(86400));
    if (previous.isEmpty())
      jdbc.sql(
              "INSERT INTO"
                  + " singflow.participant_grants(id,session_id,token_hash,browser_hash,expires_at)"
                  + " VALUES (?,?,?,?,?)")
          .params(
              UUID.randomUUID(),
              session,
              AudienceLimits.hash(next),
              browserHash,
              Timestamp.from(expiry))
          .update();
    else
      jdbc.sql(
              "UPDATE singflow.participant_grants SET token_hash=? WHERE session_id=? AND"
                  + " browser_hash=?")
          .params(AudienceLimits.hash(next), session, browserHash)
          .update();
    return new Prepared(next, expiry);
  }

  @Transactional
  public OwnView join(
      UUID session,
      String raw,
      String code,
      String name,
      String table,
      String title,
      String artist) {
    String owner = owner(session, true);
    var g = grant(session, raw, false);
    if (g.participantId() != null) return me(session, raw);
    checkCode(session, code);
    requests.registerSelf(session, owner, g.id(), name, table, title, artist);
    jdbc.sql("UPDATE singflow.participant_grants SET participant_id=id WHERE id=?")
        .param(g.id())
        .update();
    return me(session, raw);
  }

  @Transactional
  public OwnView me(UUID session, String raw) {
    String owner = owner(session, false);
    var g = grant(session, raw, true);
    var p =
        participants.list(session, owner).stream()
            .filter(v -> v.id().equals(g.participantId()))
            .findFirst()
            .orElseThrow(this::unavailable);
    var s = stage.snapshot(session, owner);
    return new OwnView(
        sessions.requireOwned(session, owner),
        p,
        requests.list(session, owner).stream()
            .filter(r -> r.participantId().equals(p.id()))
            .toList(),
        s.active() != null && s.active().participantId().equals(p.id()) ? s.active() : null,
        s.history().stream().filter(c -> c.participantId().equals(p.id())).toList(),
        s.suggestions().stream()
            .findFirst()
            .map(v -> v.participantId().equals(p.id()))
            .orElse(false),
        g.expiresAt(),
        "SELF".equals(g.departure())
            && p.status().equals("LEFT")
            && sessions.requireOwned(session, owner).status().equals("OPEN"));
  }

  @Transactional
  public OwnView add(UUID session, String raw, UUID operation, String title, String artist) {
    String owner = owner(session, true);
    var g = grant(session, raw, true);
    requests.addSelf(session, owner, g.participantId(), operation, title, artist);
    return me(session, raw);
  }

  @Transactional
  public OwnView cancel(UUID session, String raw, UUID request) {
    String owner = owner(session, true);
    var g = grant(session, raw, true);
    requests.cancelSelf(session, owner, g.participantId(), request);
    return me(session, raw);
  }

  @Transactional
  public OwnView respond(UUID session, String raw, UUID call, boolean accept) {
    String owner = owner(session, true);
    var g = grant(session, raw, true);
    stage.respond(session, owner, g.participantId(), call, accept);
    return me(session, raw);
  }

  @Transactional
  public OwnView resume(UUID session, String raw) {
    String owner = owner(session, true);
    var g = grant(session, raw, true);
    stage.resumeSelf(session, owner, g.participantId());
    return me(session, raw);
  }

  @Transactional
  public OwnView leave(UUID session, String raw) {
    String owner = owner(session, true);
    var g = grant(session, raw, true);
    requests.leaveSelf(session, owner, g.participantId());
    return me(session, raw);
  }

  @Transactional
  public OwnView returnToQueue(
      UUID session, String raw, UUID operation, String title, String artist) {
    String owner = owner(session, true);
    var g = grant(session, raw, true);
    if (operation == null
        || title == null
        || title.isBlank()
        || title.length() > 160
        || artist != null && artist.length() > 160)
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Informe a nova música com até 160 caracteres.");
    String cleanTitle = title.strip();
    String cleanArtist = artist == null || artist.isBlank() ? null : artist.strip();
    var previous =
        jdbc.sql(
                "SELECT grant_id,title,artist FROM singflow.participant_returns WHERE"
                    + " operation_id=?")
            .param(operation)
            .query(
                (rs, n) ->
                    new ReturnOperation(
                        rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3)))
            .optional();
    if (previous.isPresent()) {
      var saved = previous.get();
      if (!saved.grantId().equals(g.id())
          || !saved.title().equals(cleanTitle)
          || !Objects.equals(saved.artist(), cleanArtist))
        throw new ResponseStatusException(HttpStatus.CONFLICT, "Identificador já utilizado.");
      return me(session, raw);
    }
    var current = me(session, raw);
    if (!current.canReturn())
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "Seu retorno depende do anfitrião ou você já está participando.");
    var p = current.participant();
    participants.updateStage(session, owner, p.id(), "ACTIVE", 0, p.consecutiveAbsences(), true);
    requests.addSelf(session, owner, p.id(), operation, cleanTitle, cleanArtist);
    jdbc.sql(
            "INSERT INTO singflow.participant_returns(operation_id,grant_id,title,artist) VALUES"
                + " (?,?,?,?)")
        .params(operation, g.id(), cleanTitle, cleanArtist)
        .update();
    jdbc.sql("UPDATE singflow.participant_grants SET departure=NULL WHERE id=?")
        .param(g.id())
        .update();
    audit.record("participant:" + p.id(), session, "SELF_RETURNED", p.id());
    return me(session, raw);
  }

  private record ReturnOperation(UUID grantId, String title, String artist) {}

  @Transactional
  public void forget(UUID session, String raw) {
    String owner = owner(session, false);
    var g = grant(session, raw, true);
    var current = me(session, raw);
    if (current.session().status().equals("OPEN") && !current.participant().status().equals("LEFT"))
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "Saia da fila antes de esquecer seu acesso neste aparelho.");
    jdbc.sql("UPDATE singflow.participant_grants SET revoked=true WHERE id=?")
        .param(g.id())
        .update();
    audit.record(
        "participant:" + g.participantId(), session, "SELF_ACCESS_FORGOTTEN", g.participantId());
  }

  @EventListener
  @Transactional(propagation = Propagation.MANDATORY)
  public void onLeaving(ParticipantLeaving event) {
    if (event.voluntary()) {
      jdbc.sql(
              "UPDATE singflow.participant_grants SET departure=? WHERE session_id=? AND"
                  + " participant_id=?")
          .params(
              event.selfReturnAllowed() ? "SELF" : "SELF_RESTRICTED",
              event.sessionId(),
              event.participantId())
          .update();
    } else {
      int changed =
          jdbc.sql(
                  "UPDATE singflow.participant_grants SET revoked=true,departure='HOST' WHERE"
                      + " session_id=? AND participant_id=? AND NOT revoked")
              .params(event.sessionId(), event.participantId())
              .update();
      if (changed > 0)
        audit.record(
            event.auditActor(), event.sessionId(), "HOST_ACCESS_REVOKED", event.participantId());
    }
  }
}
