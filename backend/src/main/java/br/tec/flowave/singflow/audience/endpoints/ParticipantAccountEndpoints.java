package br.tec.flowave.singflow.audience.endpoints;

import br.tec.flowave.singflow.audience.*;
import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.security.Principal;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
class ParticipantAccountEndpoints {
  record Restore(UUID replaceParticipantId) {}
  private final AudienceAccounts accounts;
  private final AudienceService audience;
  private final AudienceLimits limits;
  private final boolean secure;
  ParticipantAccountEndpoints(AudienceAccounts accounts,AudienceService audience,AudienceLimits limits,@Value("${server.servlet.session.cookie.secure:false}") boolean secure){this.accounts=accounts;this.audience=audience;this.limits=limits;this.secure=secure;}
  private String actor(Principal principal){if(principal==null)throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Entre na sua conta.");return principal.getName();}
  private String cookie(HttpServletRequest request){return request.getCookies()==null?null:Arrays.stream(request.getCookies()).filter(c->c.getName().equals("SF_PARTICIPANT")).map(Cookie::getValue).findFirst().orElse(null);}
  @GetMapping("/api/participant-account/me") AudienceAccounts.Profile me(Principal principal){return accounts.profile(actor(principal));}
  @GetMapping("/api/participant-account/sessions") List<AudienceAccounts.LinkedSession> sessions(Principal principal){return accounts.sessions(actor(principal));}
  @PostMapping("/api/participation/{session}/account-link") ResponseEntity<Void> link(@PathVariable UUID session,Principal principal,HttpServletRequest request){
    audience.linkAccount(session,cookie(request),request.getHeader("X-SingFlow-Participant"),actor(principal));
    return ResponseEntity.noContent().build();
  }
  @GetMapping("/api/participation/{session}/account-restore-info")
  AudienceService.ClaimInfo info(@PathVariable UUID session,Principal principal,HttpServletRequest request){return audience.accountRestoreInfo(session,actor(principal),cookie(request),request.getSession().getId());}
  @PostMapping("/api/participation/{session}/account-restore") ResponseEntity<Void> restore(@PathVariable UUID session,@RequestBody Restore input,Principal principal,HttpServletRequest request){
    String actor=actor(principal);
    if(limits.count("account-restore:"+actor)>10)throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"Aguarde para tentar novamente.");
    var grant=audience.restoreAccount(session,actor,cookie(request),request.getSession().getId(),input.replaceParticipantId());
    var cookie=ResponseCookie.from("SF_PARTICIPANT",grant.token()).httpOnly(true).secure(secure).sameSite("Lax").path("/api/participation/"+session).maxAge(Duration.ofDays(365)).build();
    return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE,cookie.toString()).build();
  }
}
