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
}
