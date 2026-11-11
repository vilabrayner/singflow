package br.tec.flowave.singflow.identity;

import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AccountAccess {
  private final JdbcClient jdbc;
  private final AccountLifecycle lifecycle;

  public AccountAccess(JdbcClient jdbc, AccountLifecycle lifecycle) {
    this.jdbc = jdbc;
    this.lifecycle = lifecycle;
  }

  public void registerMusician(String email, String password) {
    lifecycle.register(email.trim().split("@", 2)[0], email, password, "MUSICIAN");
  }

  @Transactional(readOnly = true)
  public void requireMusician(String email) {
    boolean exists =
        jdbc.sql(
                "SELECT EXISTS(SELECT 1 FROM singflow.host_accounts WHERE email=? AND"
                    + " role='MUSICIAN' AND email_verified AND status='APPROVED')")
            .param(email)
            .query(Boolean.class)
            .single();
    if (!exists)
      throw new ResponseStatusException(
          HttpStatus.NOT_FOUND,
          "O músico precisa confirmar seu e-mail e ter o cadastro aprovado antes de receber"
              + " acesso.");
  }

  public record Musician(UUID id, String name) {}

  @Transactional(readOnly = true)
  public List<Musician> approvedMusicians() {
    return jdbc.sql(
            "SELECT account_id,CASE WHEN trim(display_name)='' THEN 'Músico ' ||"
                + " left(account_id::text,8) ELSE display_name END AS name FROM"
                + " singflow.host_accounts WHERE role='MUSICIAN' AND email_verified AND"
                + " status='APPROVED' ORDER BY lower(display_name),account_id")
        .query((rs, n) -> new Musician(rs.getObject(1, UUID.class), rs.getString(2)))
        .list();
  }

  @Transactional
  public String musicianEmail(UUID id, boolean requireApproved) {
    return jdbc.sql(
            "SELECT email FROM singflow.host_accounts WHERE account_id=? AND role='MUSICIAN'"
                + (requireApproved ? " AND email_verified AND status='APPROVED'" : "")
                + " FOR UPDATE")
        .param(id)
        .query(String.class)
        .optional()
        .orElseThrow(
            () ->
                new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Músico indisponível. Atualize a lista de músicos aprovados."));
  }
}
