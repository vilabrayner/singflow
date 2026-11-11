package br.tec.flowave.singflow.identity;

import java.nio.charset.StandardCharsets;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AccountAccess {
  private final JdbcClient jdbc;
  private final PasswordEncoder encoder;

  public AccountAccess(JdbcClient jdbc, PasswordEncoder encoder) {
    this.jdbc = jdbc;
    this.encoder = encoder;
  }

  @Transactional
  public void registerMusician(String email, String password) {
    if (password.length() < 12 || password.getBytes(StandardCharsets.UTF_8).length > 72)
      throw new ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Use uma senha com pelo menos 12 caracteres e até 72 bytes.");
    int created =
        jdbc.sql(
                """
                INSERT INTO singflow.host_accounts(email,password_hash,role) VALUES (?,?,'MUSICIAN')
                ON CONFLICT (email) DO NOTHING
                """)
            .params(email.trim().toLowerCase(Locale.ROOT), encoder.encode(password))
            .update();
    if (created == 0)
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "Já existe uma conta com este e-mail. Faça login.");
  }

  @Transactional(readOnly = true)
  public void requireMusician(String email) {
    boolean exists =
        jdbc.sql(
                "SELECT EXISTS(SELECT 1 FROM singflow.host_accounts WHERE email=? AND"
                    + " role='MUSICIAN')")
            .param(email)
            .query(Boolean.class)
            .single();
    if (!exists)
      throw new ResponseStatusException(
          HttpStatus.NOT_FOUND, "O músico precisa criar sua conta antes de receber acesso.");
  }
}
