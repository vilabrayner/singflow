package br.tec.flowave.singflow.identity.endpoints;

import br.tec.flowave.singflow.identity.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
class AccountEndpoints {
  record Registration(
      @NotBlank @Size(max = 120) String name,
      @NotBlank @Email @Size(max = 254) String email,
      @NotBlank @Size(min = 12, max = 72) String password,
      @Pattern(regexp = "HOST|MUSICIAN") @NotNull String role) {}

  record EmailInput(@NotBlank @Email @Size(max = 254) String email) {}

  record Token(@NotBlank @Size(max = 100) String token) {}

  record Decision(
      @NotBlank String email,
      @NotBlank String status,
      @NotNull @Size(max = 500) String reason,
      @Min(0) long version) {}

  private final AccountLifecycle accounts;
  private final AccountLimits limits;

  AccountEndpoints(AccountLifecycle accounts, AccountLimits limits) {
    this.accounts = accounts;
    this.limits = limits;
  }

  @PostMapping("/api/public/accounts/register")
  ResponseEntity<Void> register(
      @Valid @RequestBody Registration input, HttpServletRequest request) {
    limits.check("signup:" + request.getRemoteAddr(), 10);
    accounts.register(input.name(), input.email(), input.password(), input.role());
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/api/public/accounts/resend")
  ResponseEntity<Void> resend(@Valid @RequestBody EmailInput input, HttpServletRequest request) {
    limits.check("resend:" + request.getRemoteAddr(), 10);
    limits.check("resend-email:" + AccountLifecycle.normalize(input.email()), 2);
    accounts.resend(input.email());
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/api/public/accounts/verify")
  ResponseEntity<Void> verify(@Valid @RequestBody Token input, HttpServletRequest request) {
    limits.check("verify:" + request.getRemoteAddr(), 30);
    accounts.verify(input.token());
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/api/admin/accounts")
  AccountLifecycle.Page list(
      @RequestParam(defaultValue = "") String search,
      @RequestParam(defaultValue = "") String status,
      @RequestParam(defaultValue = "") String role,
      @RequestParam(defaultValue = "0") int page) {
    return accounts.list(search.trim(), status, role, page);
  }

  @GetMapping("/api/admin/accounts/history")
  List<AccountLifecycle.Event> history(@RequestParam String email) {
    return accounts.history(email);
  }

  @PostMapping("/api/admin/accounts/decision")
  AccountLifecycle.Account decide(@Valid @RequestBody Decision input, Authentication principal) {
    return accounts.decide(
        principal.getName(), input.email(), input.status(), input.reason(), input.version());
  }
}
