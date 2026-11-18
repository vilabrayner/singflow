package br.tec.flowave.singflow.television;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.security.Principal;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
class TelevisionEndpoints {
  record Edit(boolean enabled,UUID venueId,UUID projectId,@Min(0) long version) {}
  record Open(boolean enabled,@NotNull UUID venueId,@NotNull UUID projectId,@Min(0) long version) {}
  private final Television television;
  TelevisionEndpoints(Television television){this.television=television;}
  @GetMapping("/api/sessions/{id}/tv") Television.Settings configuration(@PathVariable UUID id,Principal actor){return television.configuration(id,actor.getName());}
  @PostMapping("/api/sessions/{id}/tv") Television.Settings edit(@PathVariable UUID id,Principal actor,@Valid @RequestBody Edit edit){return television.configure(id,actor.getName(),new Television.Settings(edit.enabled(),edit.venueId(),edit.projectId(),edit.version()));}
  @PostMapping("/api/sessions/{id}/presentation/open") br.tec.flowave.singflow.sessions.SessionAccess.SessionView open(@PathVariable UUID id,Principal actor,@Valid @RequestBody Open input){return television.open(id,actor.getName(),input.enabled(),input.venueId(),input.projectId(),input.version());}
  @GetMapping("/api/public/tv/{id}") ResponseEntity<Television.View> view(@PathVariable UUID id){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(television.view(id));}
}
