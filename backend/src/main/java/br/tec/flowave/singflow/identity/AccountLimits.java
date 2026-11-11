package br.tec.flowave.singflow.identity;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AccountLimits {
  private final JdbcClient jdbc;

  public AccountLimits(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void check(String bucket, int maximum) {
    jdbc.sql("DELETE FROM singflow.account_rate_limits WHERE window_start<now()-interval '1 day'")
        .update();
    int count =
        jdbc.sql(
                "INSERT INTO singflow.account_rate_limits VALUES (?,now(),1) ON"
                    + " CONFLICT(bucket_key) DO UPDATE SET hits=CASE WHEN"
                    + " account_rate_limits.window_start<now()-interval '1 minute' THEN 1 ELSE"
                    + " account_rate_limits.hits+1 END,window_start=CASE WHEN"
                    + " account_rate_limits.window_start<now()-interval '1 minute' THEN now() ELSE"
                    + " account_rate_limits.window_start END RETURNING hits")
            .param(AccountLifecycle.hash(bucket))
            .query(Integer.class)
            .single();
    if (count > maximum)
      throw new ResponseStatusException(
          HttpStatus.TOO_MANY_REQUESTS, "Muitas tentativas. Aguarde um minuto.");
  }
}
