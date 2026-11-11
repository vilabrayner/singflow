package br.tec.flowave.singflow.identity;

import java.util.Locale;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration(proxyBeanMethods = false)
class HostProvisioning {
  @Bean
  @org.springframework.core.annotation.Order(0)
  ApplicationRunner provisionHost(JdbcClient jdbc, PasswordEncoder encoder, Environment env) {
    return args -> {
      String email = env.getProperty("SINGFLOW_HOST_EMAIL", "").trim().toLowerCase(Locale.ROOT);
      String password = env.getProperty("SINGFLOW_HOST_PASSWORD", "");
      if (email.isEmpty() && password.isEmpty()) return;
      if (email.length() > 254
          || !email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")
          || password.length() < 12
          || password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72) {
        throw new IllegalStateException(
            "Defina SINGFLOW_HOST_EMAIL válido e SINGFLOW_HOST_PASSWORD com 12 a 72 caracteres.");
      }
      jdbc.sql(
              "INSERT INTO singflow.host_accounts(email, password_hash) VALUES (:email, :hash) ON"
                  + " CONFLICT (email) DO NOTHING")
          .param("email", email)
          .param("hash", encoder.encode(password))
          .update();
    };
  }

  @Bean
  @org.springframework.core.annotation.Order(1)
  ApplicationRunner provisionAdministrator(JdbcClient jdbc, Environment env) {
    return args -> {
      String email = env.getProperty("SINGFLOW_ADMIN_EMAIL", "").trim().toLowerCase(Locale.ROOT);
      if (email.isEmpty()) return;
      if (!email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+"))
        throw new IllegalStateException("SINGFLOW_ADMIN_EMAIL inválido.");
      var eligible =
          jdbc.sql(
                  "SELECT count(*) FROM singflow.host_accounts WHERE email=? AND email_verified AND"
                      + " status='APPROVED'")
              .param(email)
              .query(Long.class)
              .single();
      if (eligible != 1)
        throw new IllegalStateException(
            "SINGFLOW_ADMIN_EMAIL deve identificar uma conta existente, aprovada e com e-mail"
                + " confirmado.");
      jdbc.sql(
              "WITH promoted AS (UPDATE singflow.host_accounts SET"
                  + " administrator=true,account_version=account_version+1 WHERE email=? AND NOT"
                  + " administrator RETURNING email) INSERT INTO"
                  + " singflow.account_audit(id,email,actor,action) SELECT"
                  + " ?,email,'system:bootstrap','ADMIN_GRANTED' FROM promoted")
          .params(email, java.util.UUID.randomUUID())
          .update();
    };
  }
}
