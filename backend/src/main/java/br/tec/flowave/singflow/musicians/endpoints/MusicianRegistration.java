package br.tec.flowave.singflow.musicians.endpoints;

import br.tec.flowave.singflow.audience.AudienceLimits;
import br.tec.flowave.singflow.identity.AccountAccess;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
class MusicianRegistration {
  record Registration(
      @NotBlank @Email @Size(max = 254) String email,
      @NotBlank @Size(min = 12, max = 72) String password) {}

  private final AccountAccess accounts;
  private final AudienceLimits limits;
  private final int max;

  MusicianRegistration(
      AccountAccess accounts,
      AudienceLimits limits,
      @Value("${SINGFLOW_MUSICIAN_SIGNUP_LIMIT_PER_MINUTE:20}") int max) {
    this.accounts = accounts;
    this.limits = limits;
    if (max < 1) throw new IllegalArgumentException("Limite de cadastro deve ser positivo.");
    this.max = max;
  }

  @PostMapping("/api/public/musicians/register")
  ResponseEntity<Void> register(
      @Valid @RequestBody Registration input, HttpServletRequest request) {
    if (limits.count("musician-signup:" + request.getRemoteAddr()) > max) {
      return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
          .header(HttpHeaders.RETRY_AFTER, "60")
          .build();
    }
    accounts.registerMusician(input.email(), input.password());
    return ResponseEntity.noContent().build();
  }
}
