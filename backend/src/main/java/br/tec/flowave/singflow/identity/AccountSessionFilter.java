package br.tec.flowave.singflow.identity;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.ArrayList;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Check live account state on every protected request, including sessions opened before suspension.
 */
final class AccountSessionFilter extends OncePerRequestFilter {
  private final AccountLifecycle accounts;

  AccountSessionFilter(AccountLifecycle accounts) {
    this.accounts = accounts;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String path = request.getServletPath();
    if (path.isEmpty()) path = request.getRequestURI().substring(request.getContextPath().length());
    var auth = SecurityContextHolder.getContext().getAuthentication();
    if (path.startsWith("/api/")
        && !path.startsWith("/api/public/")
        && !path.startsWith("/api/participation/")
        && auth != null
        && auth.isAuthenticated()
        && !(auth instanceof AnonymousAuthenticationToken)) {
      var account = accounts.find(auth.getName());
      if (account.isEmpty()) {
        SecurityContextHolder.clearContext();
        response.setStatus(401);
        return;
      }
      var a = account.get();
      var roles = new ArrayList<SimpleGrantedAuthority>();
      roles.add(new SimpleGrantedAuthority("ROLE_" + a.role()));
      if (a.administrator() && a.active()) roles.add(new SimpleGrantedAuthority("ROLE_ADMIN"));
      var fresh =
          UsernamePasswordAuthenticationToken.authenticated(auth.getPrincipal(), null, roles);
      fresh.setDetails(auth.getDetails());
      SecurityContextHolder.getContext().setAuthentication(fresh);
      if (!path.startsWith("/api/auth/") && !a.active()) {
        response.setStatus(403);
        response.setContentType("application/problem+json");
        response
            .getWriter()
            .write(
                "{\"status\":403,\"code\":\"ACCOUNT_NOT_ACTIVE\",\"detail\":\"Seu cadastro ainda"
                    + " não está liberado. Consulte a situação da conta.\"}");
        return;
      }
    }
    chain.doFilter(request, response);
  }
}
