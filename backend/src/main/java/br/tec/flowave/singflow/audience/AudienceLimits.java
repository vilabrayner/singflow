package br.tec.flowave.singflow.audience;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class AudienceLimits {
  private final JdbcClient jdbc;

  public AudienceLimits(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  public static String hash(String input) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  // A committed count also covers rejected mutations. No raw IP or token is stored.
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public int count(String bucket) {
    jdbc.sql(
            "DELETE FROM singflow.audience_rate_limits WHERE window_start < now()-interval '1 day'")
        .update();
    return jdbc.sql(
            """
            INSERT INTO singflow.audience_rate_limits(bucket_key,window_start,hits)
            VALUES (:key,now(),1)
            ON CONFLICT(bucket_key) DO UPDATE SET
              hits = CASE WHEN audience_rate_limits.window_start < now()-interval '1 minute'
                          THEN 1 ELSE audience_rate_limits.hits+1 END,
              window_start = CASE WHEN audience_rate_limits.window_start < now()-interval '1 minute'
                                  THEN now() ELSE audience_rate_limits.window_start END
            RETURNING hits
            """)
        .param("key", hash(bucket))
        .query(Integer.class)
        .single();
  }
}
