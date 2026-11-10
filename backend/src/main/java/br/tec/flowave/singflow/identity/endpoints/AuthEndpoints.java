package br.tec.flowave.singflow.identity.endpoints;

import java.security.Principal;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
class AuthEndpoints {
  record CsrfView(String token, String headerName) {}

  record HostView(String email) {}

  @GetMapping("/csrf")
  CsrfView csrf(CsrfToken token) {
    return new CsrfView(token.getToken(), token.getHeaderName());
  }

  @GetMapping("/me")
  HostView me(Principal principal) {
    return new HostView(principal.getName());
  }
}
