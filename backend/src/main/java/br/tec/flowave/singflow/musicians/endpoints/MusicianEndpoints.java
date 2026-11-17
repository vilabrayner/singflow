package br.tec.flowave.singflow.musicians.endpoints;

import br.tec.flowave.singflow.musicians.MusicianAccess;
import br.tec.flowave.singflow.sessions.SessionAccess;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.security.Principal;
import java.util.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
class MusicianEndpoints {
  record Grant(@NotNull UUID operationId, @NotNull UUID musicianId) {}

  record Member(@NotNull UUID musicianId) {}

  private final MusicianAccess access;
  private final br.tec.flowave.singflow.catalog.CifraSearch cifraSearch;

  MusicianEndpoints(MusicianAccess access,br.tec.flowave.singflow.catalog.CifraSearch cifraSearch) {
    this.access = access;
    this.cifraSearch=cifraSearch;
  }

  @GetMapping("/api/sessions/{session}/musicians")
  List<MusicianAccess.Member> members(@PathVariable UUID session, Principal actor) {
    return access.members(session, actor.getName());
  }

  @GetMapping("/api/sessions/{session}/musicians/available")
  List<br.tec.flowave.singflow.identity.AccountAccess.Musician> available(
      @PathVariable UUID session, Principal actor) {
    return access.available(session, actor.getName());
  }

  @PostMapping("/api/sessions/{session}/musicians")
  List<MusicianAccess.Member> grant(
      @PathVariable UUID session, Principal actor, @Valid @RequestBody Grant input) {
    return access.grantById(session, actor.getName(), input.operationId(), input.musicianId());
  }

  @PostMapping("/api/sessions/{session}/musicians/revoke")
  List<MusicianAccess.Member> revoke(
      @PathVariable UUID session, Principal actor, @Valid @RequestBody Member input) {
    return access.revokeById(session, actor.getName(), input.musicianId());
  }

  private boolean host(Authentication actor) {
    return actor.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_HOST"));
  }

  @GetMapping("/api/musicians/sessions")
  List<SessionAccess.SessionView> list(Authentication actor) {
    return access.list(actor.getName(), host(actor));
  }

  @GetMapping("/api/musicians/sessions/{session}")
  MusicianAccess.PerformanceView performance(@PathVariable UUID session, Authentication actor) {
    return access.performance(session, actor.getName(), host(actor));
  }
  record PerformedKey(@NotNull @Min(0) Long version,@Size(max=4) String performedKey) {}
  @PostMapping("/api/musicians/sessions/{session}/calls/{call}/key")
  MusicianAccess.PerformanceView recordKey(@PathVariable UUID session,@PathVariable UUID call,Authentication actor,@Valid @RequestBody PerformedKey input) {
    return access.recordKey(session,actor.getName(),call,input.version(),input.performedKey());
  }

  record Chord(@NotNull @Min(0) Long version,@Size(max=2048) String url) {}
  @GetMapping("/api/musicians/sessions/{session}/songs/{song}/chords")
  br.tec.flowave.singflow.catalog.CifraResources.Link chord(@PathVariable UUID session,@PathVariable UUID song,Principal actor){return access.chordContext(session,actor.getName(),song);}
  @PostMapping("/api/musicians/sessions/{session}/songs/{song}/chords")
  br.tec.flowave.singflow.catalog.CifraResources.Link saveChord(@PathVariable UUID session,@PathVariable UUID song,Principal actor,@Valid @RequestBody Chord input){return access.saveChord(session,actor.getName(),song,input.version(),input.url());}
  @GetMapping("/api/musicians/sessions/{session}/songs/{song}/chords/search")
  br.tec.flowave.singflow.catalog.CifraSearch.Page searchChords(@PathVariable UUID session,@PathVariable UUID song,Principal actor,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="1") int page){access.chordContext(session,actor.getName(),song);return cifraSearch.search(q,page);}

}
