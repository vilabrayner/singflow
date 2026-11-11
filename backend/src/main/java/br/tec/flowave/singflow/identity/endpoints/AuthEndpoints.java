package br.tec.flowave.singflow.identity.endpoints;

import org.springframework.security.core.Authentication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
class AuthEndpoints {
  record CsrfView(String token, String headerName) {}

  record HostView(String email, String role) {}

  @GetMapping("/csrf")
  CsrfView csrf(CsrfToken token) {
    return new CsrfView(token.getToken(), token.getHeaderName());
  }

  @GetMapping("/me")
  HostView me(Authentication principal) {
    String role =
        principal.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_HOST"))
            ? "HOST"
            : "MUSICIAN";
    return new HostView(principal.getName(), role);
  }
}
