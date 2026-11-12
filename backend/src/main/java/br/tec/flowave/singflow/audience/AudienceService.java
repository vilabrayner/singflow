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
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
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
      boolean canReturn,
      Integer queuePosition) {}

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
      @Value("${SINGFLOW_PUBLIC_APP_URL:http://127.0.0.1:4200}") String appUrl,
      Environment environment) {
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
        || !("https".equals(uri.getScheme())
            || "http".equals(uri.getScheme())
                && (loopback || environment.acceptsProfiles(Profiles.of("local")))))
      throw new IllegalArgumentException(
          "SINGFLOW_PUBLIC_APP_URL deve ser uma origem HTTPS (HTTP permitido no perfil local ou em"
              + " loopback).");
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

  public record MobileAccess(boolean linked, boolean pending) {}

  public record AccessInvite(String url, Instant expiresAt) {}

  public record ClaimInfo(String name, String sessionName, UUID currentId, String currentName) {}

  private record BrowserGrant(UUID id, UUID participantId) {}

  @Transactional
  public MobileAccess mobileAccess(UUID session, String actor, UUID participant) {
    sessions.lockOwned(session, actor, true);
    assisted(session, actor, participant);
    return jdbc.sql(
            """
SELECT EXISTS(SELECT 1 FROM singflow.participant_grants
              WHERE session_id=? AND participant_id=? AND NOT revoked AND (expires_at IS NULL OR expires_at>now())),
       EXISTS(SELECT 1 FROM singflow.participant_access_invites
              WHERE session_id=? AND participant_id=? AND expires_at>now())
""")
        .params(session, participant, session, participant)
        .query((rs, n) -> new MobileAccess(rs.getBoolean(1), rs.getBoolean(2)))
        .single();
  }

  @Transactional
  public AccessInvite issueAccess(UUID session, String actor, UUID participant) {
    sessions.lockOwned(session, actor, true);
    assisted(session, actor, participant);
    String code = token();
    Instant expiry = Instant.now().plusSeconds(300);
    jdbc.sql(
            """
INSERT INTO singflow.participant_access_invites(session_id,participant_id,token_hash,expires_at)
VALUES (?,?,?,?)
ON CONFLICT (session_id,participant_id) DO UPDATE
SET token_hash=excluded.token_hash, expires_at=excluded.expires_at
""")
        .params(session, participant, AudienceLimits.hash(code), Timestamp.from(expiry))
        .update();
    audit.record(actor, session, "MOBILE_ACCESS_ISSUED", participant);
    return new AccessInvite(appUrl + "/participante/" + session + "/vincular#" + code, expiry);
  }

  private Participation.ParticipantView assisted(UUID session, String owner, UUID participant) {
    return participants.list(session, owner).stream()
        .filter(
            p ->
                p.id().equals(participant)
                    && p.origin().equals("ASSISTED")
                    && !p.status().equals("LEFT"))
        .findFirst()
        .orElseThrow(
            () ->
                new ResponseStatusException(
                    HttpStatus.NOT_FOUND, "Participação indisponível para vincular."));
  }

  private UUID invited(UUID session, String code) {
    return jdbc.sql(
            """
            SELECT participant_id FROM singflow.participant_access_invites
            WHERE session_id=? AND token_hash=? AND expires_at>now()
            """)
        .params(session, AudienceLimits.hash(code))
        .query(UUID.class)
        .optional()
        .orElseThrow(
            () ->
                new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "QR Code expirado ou já utilizado. Peça outro ao anfitrião."));
  }

  private Optional<BrowserGrant> browserGrant(UUID session, String raw, String browser) {
    String tokenHash = AudienceLimits.hash(raw == null ? "" : raw);
    return jdbc.sql(
            """
SELECT id, CASE WHEN NOT revoked AND (expires_at IS NULL OR expires_at>now()) THEN participant_id END
FROM singflow.participant_grants
WHERE session_id=? AND (browser_hash=? OR
  (token_hash=? AND NOT revoked AND (expires_at IS NULL OR expires_at>now())))
ORDER BY (token_hash=?) DESC
LIMIT 1
""")
        .params(session, AudienceLimits.hash(browser), tokenHash, tokenHash)
        .query(
            (rs, n) -> new BrowserGrant(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class)))
        .optional();
  }

  @Transactional
  public ClaimInfo claimInfo(UUID session, String code, String raw, String browser) {
    String owner = owner(session, true);
    var target = assisted(session, owner, invited(session, code));
    UUID current =
        browserGrant(session, raw, browser)
            .map(BrowserGrant::participantId)
            .filter(id -> !id.equals(target.id()))
            .orElse(null);
    String currentName =
        participants.list(session, owner).stream()
            .filter(p -> p.id().equals(current))
            .map(Participation.ParticipantView::name)
            .findFirst()
            .orElse(null);
    return new ClaimInfo(
        target.name(), sessions.requireOwned(session, owner).name(), current, currentName);
  }

  @Transactional
  public Prepared claimAccess(UUID session, String code, String raw, String browser, UUID replace) {
    String owner = owner(session, true);
    UUID target = assisted(session, owner, invited(session, code)).id();
    var previous = browserGrant(session, raw, browser);
    UUID current =
        previous.map(BrowserGrant::participantId).filter(id -> !id.equals(target)).orElse(null);
    if (!Objects.equals(current, replace))
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "O vínculo deste celular mudou. Revise e confirme novamente.");
    jdbc.sql(
            """
            UPDATE singflow.participant_grants SET revoked=true
            WHERE session_id=? AND participant_id=? AND NOT revoked
            """)
        .params(session, target)
        .update();
    String next = token();
    if (previous.isPresent()) {
      jdbc.sql(
              """
              UPDATE singflow.participant_grants
              SET participant_id=?,token_hash=?,expires_at=NULL,revoked=false,departure=NULL
              WHERE id=?
              """)
          .params(target, AudienceLimits.hash(next), previous.get().id())
          .update();
    } else {
      jdbc.sql(
              """
INSERT INTO singflow.participant_grants
(id,session_id,participant_id,token_hash,browser_hash,expires_at) VALUES (?,?,?,?,?,NULL)
""")
          .params(
              UUID.randomUUID(),
              session,
              target,
              AudienceLimits.hash(next),
              AudienceLimits.hash(browser))
          .update();
    }
    deleteInvite(session, target);
    audit.record("participant:" + target, session, "MOBILE_ACCESS_LINKED", target);
    return new Prepared(next, null);
  }

  private void deleteInvite(UUID session, UUID participant) {
    jdbc.sql(
            "DELETE FROM singflow.participant_access_invites WHERE session_id=? AND"
                + " participant_id=?")
        .params(session, participant)
        .update();
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
WHERE session_id=? AND token_hash=? AND NOT revoked AND (expires_at IS NULL OR expires_at>now())
  AND session_id IN (SELECT id FROM singflow.sessions WHERE status='OPEN')
""")
            .params(session, AudienceLimits.hash(raw))
            .query(
                (rs, n) ->
                    new Grant(
                        rs.getObject(1, UUID.class),
                        rs.getObject(2, UUID.class),
                        rs.getTimestamp(3) == null ? null : rs.getTimestamp(3).toInstant(),
                        rs.getString(4)))
            .optional();
    var g = found.orElseThrow(this::unavailable);
    if (requireParticipant && g.participantId() == null) throw unavailable();
    return g;
  }

  @Transactional(readOnly = true)
  public UUID credentialKey(UUID session, String raw, String expectedParticipant) {
    var g = grant(session, raw, false);
    if (expectedParticipant != null
        && !expectedParticipant.equals(Objects.toString(g.participantId(), "")))
      throw new ResponseStatusException(
          HttpStatus.CONFLICT,
          "A participação vinculada mudou. Atualize a tela antes de continuar.");
    return g.id();
  }

  private record BrowserAccess(Instant expiresAt, boolean revoked) {}

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
            .query(
                (rs, n) ->
                    new BrowserAccess(
                        rs.getTimestamp(1) == null ? null : rs.getTimestamp(1).toInstant(),
                        rs.getBoolean(2)))
            .optional();
    if (previous.isPresent()
        && (previous.get().revoked()
            || (previous.get().expiresAt() != null
                && !previous.get().expiresAt().isAfter(Instant.now()))))
      throw new ResponseStatusException(
          HttpStatus.GONE,
          "Seu acesso terminou. Procure o anfitrião para retornar sem duplicar o cadastro.");
    String next = token();
    if (previous.isEmpty())
      jdbc.sql(
              "INSERT INTO"
                  + " singflow.participant_grants(id,session_id,token_hash,browser_hash,expires_at)"
                  + " VALUES (?,?,?,?,NULL)")
          .params(UUID.randomUUID(), session, AudienceLimits.hash(next), browserHash)
          .update();
    else
      jdbc.sql(
              "UPDATE singflow.participant_grants SET token_hash=?,expires_at=NULL WHERE"
                  + " session_id=? AND browser_hash=?")
          .params(AudienceLimits.hash(next), session, browserHash)
          .update();
    return new Prepared(next, null);
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
    return join(session, raw, code, name, table, title, artist, null);
  }

  @Transactional
  public OwnView join(
      UUID session,
      String raw,
      String code,
      String name,
      String table,
      String title,
      String artist,
      String selectionToken) {
    String owner = owner(session, true);
    var g = grant(session, raw, false);
    if (g.participantId() != null) return me(session, raw);
    checkCode(session, code);
    requests.registerSelf(session, owner, g.id(), name, table, title, artist, selectionToken);
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
    int index =
        s.suggestions().stream()
            .map(StageService.Suggestion::participantId)
            .toList()
            .indexOf(p.id());
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
            && sessions.requireOwned(session, owner).status().equals("OPEN"),
        index < 0 ? null : index + 1);
  }

  @Transactional
  public OwnView add(UUID session, String raw, UUID operation, String title, String artist) {
    return add(session, raw, operation, title, artist, null);
  }

  @Transactional
  public OwnView add(
      UUID session,
      String raw,
      UUID operation,
      String title,
      String artist,
      String selectionToken) {
    String owner = owner(session, true);
    var g = grant(session, raw, true);
    requests.addSelf(session, owner, g.participantId(), operation, title, artist, selectionToken);
    return me(session, raw);
  }

  @Transactional
  public OwnView reorder(
      UUID session, String raw, UUID operation, List<UUID> expected, List<UUID> ordered) {
    String owner = owner(session, true);
    var g = grant(session, raw, true);
    requests.reorder(session, owner, g.participantId(), operation, expected, ordered);
    return me(session, raw);
  }

  @Transactional
  public OwnView edit(
      UUID session,
      String raw,
      UUID request,
      String expectedTitle,
      String expectedArtist,
      String title,
      String artist,
      String selectionToken) {
    String owner = owner(session, true);
    var g = grant(session, raw, true);
    requests.editSelf(
        session,
        owner,
        g.participantId(),
        request,
        expectedTitle,
        expectedArtist,
        title,
        artist,
        selectionToken);
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
    return returnToQueue(session, raw, operation, title, artist, null);
  }

  @Transactional
  public OwnView returnToQueue(
      UUID session,
      String raw,
      UUID operation,
      String title,
      String artist,
      String selectionToken) {
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
    requests.addSelf(session, owner, p.id(), operation, cleanTitle, cleanArtist, selectionToken);
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
    deleteInvite(event.sessionId(), event.participantId());
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
