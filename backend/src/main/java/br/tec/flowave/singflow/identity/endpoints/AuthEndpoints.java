package br.tec.flowave.singflow.identity.endpoints;

import org.springframework.security.core.Authentication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
class AuthEndpoints {
  private final br.tec.flowave.singflow.identity.AccountLifecycle accounts;

  AuthEndpoints(br.tec.flowave.singflow.identity.AccountLifecycle accounts) {
    this.accounts = accounts;
  }

  record CsrfView(String token, String headerName) {}

  @GetMapping("/csrf")
  CsrfView csrf(CsrfToken token) {
    return new CsrfView(token.getToken(), token.getHeaderName());
  }

  @GetMapping("/me")
  br.tec.flowave.singflow.identity.AccountLifecycle.Account me(Authentication principal) {
    return accounts.get(principal.getName());
  }
}
