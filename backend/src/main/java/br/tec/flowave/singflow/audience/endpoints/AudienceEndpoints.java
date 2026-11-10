package br.tec.flowave.singflow.audience.endpoints;

import br.tec.flowave.singflow.audience.*;
import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.security.Principal;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
class AudienceEndpoints {
  record Code(@NotBlank @Size(max = 64) String code) {}

  record Rotation(@NotNull UUID operationId) {}

  record Join(
      @NotBlank @Size(max = 64) String code,
      @NotBlank @Size(max = 120) String name,
      @Size(max = 40) String tableLabel,
      @NotBlank @Size(max = 160) String title,
      @Size(max = 160) String artist) {}

  record Song(
      @NotNull UUID operationId,
      @NotBlank @Size(max = 160) String title,
      @Size(max = 160) String artist) {}

  private final AudienceService service;
  private final AudienceLimits limits;
  private final boolean secure;
  private final int joins;
  private final int writes;
  private final int reads;

  AudienceEndpoints(
      AudienceService service,
      AudienceLimits limits,
      @Value("${server.servlet.session.cookie.secure:false}") boolean secure,
      @Value("${SINGFLOW_ENTRY_LIMIT_PER_MINUTE:120}") int joins,
      @Value("${SINGFLOW_REQUEST_LIMIT_PER_MINUTE:20}") int writes,
      @Value("${SINGFLOW_READ_LIMIT_PER_MINUTE:120}") int reads) {
    this.service = service;
    this.limits = limits;
    this.secure = secure;
    if (joins < 1 || writes < 1 || reads < 1)
      throw new IllegalArgumentException("Limites devem ser positivos.");
    this.joins = joins;
    this.writes = writes;
    this.reads = reads;
  }

  private void rate(String bucket, int max) {
    if (limits.count(bucket) > max) {
      throw new ResponseStatusException(
          HttpStatus.TOO_MANY_REQUESTS, "Muitas tentativas. Aguarde um minuto e tente novamente.") {
        @Override
        public HttpHeaders getHeaders() {
          var headers = new HttpHeaders();
          headers.set(HttpHeaders.RETRY_AFTER, "60");
          return headers;
        }
      };
    }
  }

  private String cookie(HttpServletRequest request) {
    if (request.getCookies() == null) return null;
    return Arrays.stream(request.getCookies())
        .filter(c -> c.getName().equals("SF_PARTICIPANT"))
        .map(Cookie::getValue)
        .findFirst()
        .orElse(null);
  }

  private String credential(UUID session, HttpServletRequest request, boolean write) {
    String token = cookie(request);
    if (token == null || token.length() > 128)
      throw new ResponseStatusException(
          HttpStatus.UNAUTHORIZED, "Abra o link da sessão para participar.");
    rate(
        (write ? "write:" : "read:") + session + ":" + service.credentialKey(session, token),
        write ? writes : reads);
    return token;
  }

  private String setCookie(UUID session, String token, Duration age) {
    return ResponseCookie.from("SF_PARTICIPANT", token)
        .httpOnly(true)
        .secure(secure)
        .sameSite("Lax")
        .path("/api/participation/" + session)
        .maxAge(age.isNegative() ? Duration.ZERO : age)
        .build()
        .toString();
  }

  @GetMapping("/api/sessions/{session}/entry-link")
  AudienceService.EntryLink entry(@PathVariable UUID session, Principal actor) {
    return service.entryLink(session, actor.getName(), null);
  }

  @PostMapping("/api/sessions/{session}/entry-link/rotate")
  AudienceService.EntryLink rotate(
      @PathVariable UUID session, Principal actor, @Valid @RequestBody Rotation input) {
    return service.entryLink(session, actor.getName(), input.operationId());
  }

  @GetMapping("/api/public/sessions/{session}")
  AudienceService.EntryInfo info(
      @PathVariable UUID session, @RequestParam String code, HttpServletRequest request) {
    rate("entry-read:" + session + ":" + request.getRemoteAddr(), joins * 3);
    return service.info(session, code);
  }

  @PostMapping("/api/participation/{session}/prepare")
  ResponseEntity<Void> prepare(
      @PathVariable UUID session, @Valid @RequestBody Code input, HttpServletRequest request) {
    rate("entry-network:" + session + ":" + request.getRemoteAddr(), joins);
    rate("entry-session:" + session, joins * 3);
    var prepared =
        service.prepare(session, input.code(), cookie(request), request.getSession().getId());
    return ResponseEntity.noContent()
        .header(
            HttpHeaders.SET_COOKIE,
            setCookie(
                session, prepared.token(), Duration.between(Instant.now(), prepared.expiresAt())))
        .build();
  }

  @PostMapping("/api/participation/{session}/join")
  AudienceService.OwnView join(
      @PathVariable UUID session, @Valid @RequestBody Join input, HttpServletRequest request) {
    return service.join(
        session,
        credential(session, request, true),
        input.code(),
        input.name(),
        input.tableLabel(),
        input.title(),
        input.artist());
  }

  @GetMapping("/api/participation/{session}/me")
  AudienceService.OwnView me(@PathVariable UUID session, HttpServletRequest request) {
    return service.me(session, credential(session, request, false));
  }

  @PostMapping("/api/participation/{session}/requests")
  AudienceService.OwnView add(
      @PathVariable UUID session, @Valid @RequestBody Song input, HttpServletRequest request) {
    return service.add(
        session,
        credential(session, request, true),
        input.operationId(),
        input.title(),
        input.artist());
  }

  @PostMapping("/api/participation/{session}/requests/{song}/cancel")
  AudienceService.OwnView cancel(
      @PathVariable UUID session, @PathVariable UUID song, HttpServletRequest request) {
    return service.cancel(session, credential(session, request, true), song);
  }

  @PostMapping("/api/participation/{session}/calls/{call}/accept")
  AudienceService.OwnView accept(
      @PathVariable UUID session, @PathVariable UUID call, HttpServletRequest request) {
    return service.respond(session, credential(session, request, true), call, true);
  }

  @PostMapping("/api/participation/{session}/calls/{call}/skip")
  AudienceService.OwnView skip(
      @PathVariable UUID session, @PathVariable UUID call, HttpServletRequest request) {
    return service.respond(session, credential(session, request, true), call, false);
  }

  @PostMapping("/api/participation/{session}/resume")
  AudienceService.OwnView resume(@PathVariable UUID session, HttpServletRequest request) {
    return service.resume(session, credential(session, request, true));
  }

  @PostMapping("/api/participation/{session}/leave")
  AudienceService.OwnView leave(@PathVariable UUID session, HttpServletRequest request) {
    return service.leave(session, credential(session, request, true));
  }

  @PostMapping("/api/participation/{session}/return")
  AudienceService.OwnView returnToQueue(
      @PathVariable UUID session, @Valid @RequestBody Song input, HttpServletRequest request) {
    return service.returnToQueue(
        session,
        credential(session, request, true),
        input.operationId(),
        input.title(),
        input.artist());
  }

  @PostMapping("/api/participation/{session}/forget")
  ResponseEntity<Void> forget(@PathVariable UUID session, HttpServletRequest request) {
    service.forget(session, credential(session, request, true));
    return ResponseEntity.noContent()
        .header(HttpHeaders.SET_COOKIE, setCookie(session, "", Duration.ZERO))
        .build();
  }
}
