package br.tec.flowave.singflow.realtime;

import br.tec.flowave.singflow.audience.AudienceService;
import br.tec.flowave.singflow.identity.AccountLifecycle;
import br.tec.flowave.singflow.musicians.MusicianAccess;
import br.tec.flowave.singflow.sessions.SessionAccess;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
class RealtimeAccess {
  record Scope(String kind, String actor, UUID session, UUID grant) {}
  private final br.tec.flowave.singflow.television.Television television;
  private final AudienceService audience;
  private final AccountLifecycle accounts;
  private final SessionAccess sessions;
  private final MusicianAccess musicians;
  RealtimeAccess(AudienceService audience, AccountLifecycle accounts, SessionAccess sessions, MusicianAccess musicians, br.tec.flowave.singflow.television.Television television) {
    this.television=television;
    this.audience=audience;this.accounts=accounts;this.sessions=sessions;this.musicians=musicians;
  }
  Scope staff(String actor,String kind) {
    var a=accounts.get(actor);
    if (!a.active() || !Set.of("host","musician").contains(kind)
        || (kind.equals("host") && !a.role().equals("HOST") && !a.administrator())) throw denied();
    return new Scope(kind,actor,null,null);
  }
  Scope participant(UUID session,String raw,String expected) {
    var g=audience.realtimeAccess(session,raw,expected);
    return new Scope("participant",null,session,g.grantId());
  }
  Scope television(UUID session){
    if(!television.available(session))throw denied();
    return new Scope("tv",null,session,null);
  }
  boolean active(Scope scope) {
    if(scope.kind().equals("tv"))return television.available(scope.session());
    if (scope.kind().equals("participant")) return audience.realtimeAllowed(scope.session(),scope.grant());
    return accounts.find(scope.actor()).filter(a->a.active()
        && (!scope.kind().equals("host") || a.role().equals("HOST") || a.administrator())).isPresent();
  }
  Set<UUID> sessions(Scope scope) {
    if(Set.of("participant","tv").contains(scope.kind())) return Set.of(scope.session());
    var a=accounts.get(scope.actor());
    return (scope.kind().equals("host") ? sessions.list(scope.actor())
        : musicians.list(scope.actor(),a.role().equals("HOST"))).stream().map(SessionAccess.SessionView::id)
        .collect(java.util.stream.Collectors.toUnmodifiableSet());
  }
  private ResponseStatusException denied(){return new ResponseStatusException(HttpStatus.FORBIDDEN,"Acesso em tempo real indisponível.");}
}
