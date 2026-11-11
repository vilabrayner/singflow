package br.tec.flowave.singflow.identity;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AccountLifecycle {
  public record Account(
      String email,
      String name,
      String role,
      boolean emailVerified,
      String status,
      boolean administrator,
      Instant createdAt,
      long version) {
    public boolean active() {
      return emailVerified && status.equals("APPROVED");
    }
  }

  public record Event(String actor, String action, String reason, Instant occurredAt) {}

  public record Page(List<Account> items, long total, int page, int size) {}

  private final JdbcClient jdbc;
  private final PasswordEncoder passwords;
  private final VerificationMail mail;
  private final SecureRandom random = new SecureRandom();

  public AccountLifecycle(JdbcClient jdbc, PasswordEncoder passwords, VerificationMail mail) {
    this.jdbc = jdbc;
    this.passwords = passwords;
    this.mail = mail;
  }

  public static String normalize(String email) {
    return email.trim().toLowerCase(Locale.ROOT);
  }

  public static String hash(String value) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  private Account map(java.sql.ResultSet rs, int row) throws java.sql.SQLException {
    return new Account(
        rs.getString("email"),
        rs.getString("display_name"),
        rs.getString("role"),
        rs.getBoolean("email_verified"),
        rs.getString("status"),
        rs.getBoolean("administrator"),
        rs.getTimestamp("created_at").toInstant(),
        rs.getLong("account_version"));
  }

  public Optional<Account> find(String email) {
    return jdbc.sql("SELECT * FROM singflow.host_accounts WHERE email=?")
        .param(normalize(email))
        .query(this::map)
        .optional();
  }

  public Account get(String email) {
    return find(email)
        .orElseThrow(
            () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conta indisponível."));
  }

  private Account lock(String email) {
    return jdbc.sql("SELECT * FROM singflow.host_accounts WHERE email=? FOR UPDATE")
        .param(normalize(email))
        .query(this::map)
        .optional()
        .orElseThrow(
            () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conta indisponível."));
  }

  private void audit(String email, String actor, String action, String reason) {
    jdbc.sql("INSERT INTO singflow.account_audit(id,email,actor,action,reason) VALUES (?,?,?,?,?)")
        .params(UUID.randomUUID(), email, actor, action, reason)
        .update();
  }

  @Transactional
  public void register(String name, String email, String password, String role) {
    if (!Set.of("HOST", "MUSICIAN").contains(role)
        || name.trim().isEmpty()
        || name.length() > 120
        || password.length() < 12
        || password.getBytes(StandardCharsets.UTF_8).length > 72)
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST,
          "Informe o nome e uma senha com pelo menos 12 caracteres e até 72 bytes.");
    mail.requireConfigured();
    email = normalize(email);
    int inserted =
        jdbc.sql(
                "INSERT INTO"
                    + " singflow.host_accounts(email,password_hash,role,display_name,email_verified,status)"
                    + " VALUES (?,?,?,?,false,'PENDING') ON CONFLICT(email) DO NOTHING")
            .params(email, passwords.encode(password), role, name.trim())
            .update();
    if (inserted == 0)
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "Já existe uma conta com este e-mail. Entre na sua conta.");
    audit(email, email, "REGISTERED", "");
    sendVerification(email);
  }

  private void sendVerification(String email) {
    byte[] bytes = new byte[32];
    random.nextBytes(bytes);
    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    jdbc.sql(
            "INSERT INTO singflow.account_verifications(email,token_hash,expires_at) VALUES"
                + " (?,?,now()+interval '24 hours') ON CONFLICT(email) DO UPDATE SET"
                + " token_hash=excluded.token_hash,expires_at=excluded.expires_at,sent_at=now()")
        .params(email, hash(token))
        .update();
    // Failure rolls back the account/token; no unsent account is silently reported as successful.
    mail.send(email, token);
    audit(email, email, "VERIFICATION_SENT", "");
  }

  @Transactional
  public void resend(String input) {
    mail.requireConfigured();
    String email = normalize(input);
    var account =
        jdbc.sql("SELECT * FROM singflow.host_accounts WHERE email=? FOR UPDATE")
            .param(email)
            .query(this::map)
            .optional();
    if (account.isEmpty()
        || account.get().emailVerified()
        || !account.get().status().equals("PENDING")) return;
    boolean recent =
        jdbc.sql(
                "SELECT EXISTS(SELECT 1 FROM singflow.account_verifications WHERE email=? AND"
                    + " sent_at>now()-interval '1 minute')")
            .param(email)
            .query(Boolean.class)
            .single();
    if (!recent) sendVerification(email);
  }

  @Transactional
  public void verify(String token) {
    if (!token.matches("[A-Za-z0-9_-]{43}")) throw invalidToken();
    String digest = hash(token);
    var email =
        jdbc.sql("SELECT email FROM singflow.account_verifications WHERE token_hash=?")
            .param(digest)
            .query(String.class)
            .optional();
    if (email.isEmpty()) throw invalidToken();
    var account = lock(email.get());
    int removed =
        jdbc.sql(
                "DELETE FROM singflow.account_verifications WHERE email=? AND token_hash=? AND"
                    + " expires_at>now()")
            .params(account.email(), digest)
            .update();
    if (removed != 1 || !account.status().equals("PENDING") || account.emailVerified())
      throw invalidToken();
    jdbc.sql(
            "UPDATE singflow.host_accounts SET"
                + " email_verified=true,account_version=account_version+1 WHERE email=?")
        .param(account.email())
        .update();
    audit(account.email(), account.email(), "EMAIL_VERIFIED", "");
  }

  private ResponseStatusException invalidToken() {
    return new ResponseStatusException(
        HttpStatus.BAD_REQUEST,
        "Link inválido, expirado ou já utilizado. Solicite outro e-mail de confirmação.");
  }

  public Page list(String search, String status, String role, int page) {
    if (page < 0
        || page > 100000
        || search.length() > 120
        || !Set.of("", "PENDING", "APPROVED", "REJECTED", "SUSPENDED").contains(status)
        || !Set.of("", "HOST", "MUSICIAN").contains(role))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Filtros inválidos.");
    String where =
        " WHERE (?='' OR status=?) AND (?='' OR role=?) AND (position(lower(?) in lower(email))>0"
            + " OR position(lower(?) in lower(display_name))>0)";
    var rows =
        jdbc.sql(
                "SELECT * FROM singflow.host_accounts"
                    + where
                    + " ORDER BY created_at DESC,email LIMIT 25 OFFSET ?")
            .params(status, status, role, role, search, search, page * 25)
            .query(this::map)
            .list();
    long total =
        jdbc.sql("SELECT count(*) FROM singflow.host_accounts" + where)
            .params(status, status, role, role, search, search)
            .query(Long.class)
            .single();
    return new Page(rows, total, page, 25);
  }

  public List<Event> history(String email) {
    get(email);
    return jdbc.sql(
            "SELECT actor,action,reason,occurred_at FROM singflow.account_audit WHERE email=? ORDER"
                + " BY occurred_at DESC,id LIMIT 100")
        .param(normalize(email))
        .query(
            (rs, n) ->
                new Event(
                    rs.getString(1),
                    rs.getString(2),
                    rs.getString(3),
                    rs.getTimestamp(4).toInstant()))
        .list();
  }

  @Transactional
  public Account decide(String actor, String email, String status, String reason, long version) {
    // Live DB authorization also protects callers outside the HTTP filter.
    var admin = get(actor);
    if (!admin.active() || !admin.administrator())
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acesso administrativo necessário.");
    var account = lock(email);
    if (account.version() != version)
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "Este cadastro mudou. Atualize antes de decidir.");
    if (account.administrator())
      throw new ResponseStatusException(
          HttpStatus.CONFLICT,
          "Contas administrativas são protegidas contra bloqueio por este painel.");
    boolean valid =
        switch (status) {
          case "APPROVED" ->
              account.emailVerified()
                  && Set.of("PENDING", "REJECTED", "SUSPENDED").contains(account.status());
          case "REJECTED" -> account.status().equals("PENDING");
          case "SUSPENDED" -> account.status().equals("APPROVED");
          default -> false;
        };
    if (!valid)
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "Transição indisponível. A aprovação exige e-mail confirmado.");
    reason = reason.trim();
    if (reason.length() > 500 || (!status.equals("APPROVED") && reason.isEmpty()))
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Informe o motivo, com até 500 caracteres.");
    jdbc.sql(
            "UPDATE singflow.host_accounts SET status=?,account_version=account_version+1 WHERE"
                + " email=?")
        .params(status, account.email())
        .update();
    audit(account.email(), actor, status, reason);
    return get(account.email());
  }
}
