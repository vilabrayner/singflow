package br.tec.flowave.singflow.realtime;

import java.security.SecureRandom;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@Component
class RealtimeTickets {
  record Ticket(RealtimeAccess.Scope scope,String httpSession,Instant expires) {}
  private final Map<String,Ticket> tickets=new HashMap<>();
  private final Clock clock;
  RealtimeTickets(){this(Clock.systemUTC());}
  RealtimeTickets(Clock clock){this.clock=clock;}
  synchronized String issue(RealtimeAccess.Scope scope,String session) {
    tickets.values().removeIf(t->!t.expires().isAfter(clock.instant()));
    if(tickets.size()>=1000 || tickets.values().stream().filter(t->t.scope().equals(scope)).count()>=16 || tickets.values().stream().filter(t->t.httpSession().equals(session)).count()>=8)
      throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"Aguarde para reconectar.");
    byte[] bytes=new byte[32];new SecureRandom().nextBytes(bytes);
    String key=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    tickets.put(key,new Ticket(scope,session,clock.instant().plusSeconds(30)));
    return key;
  }
  synchronized RealtimeAccess.Scope consume(String key,String session,String path) {
    if(key==null || key.length()!=43)throw new IllegalArgumentException("Invalid realtime ticket");
    var t=tickets.remove(key);
    if(t==null || !t.expires().isAfter(clock.instant()) || !t.httpSession().equals(session))
      throw new IllegalArgumentException("Expired realtime ticket");
    String expected=t.scope().kind().equals("participant")
        ? "/api/participation/"+t.scope().session()+"/realtime/ws" : "/api/realtime/ws";
    if(!expected.equals(path))throw new IllegalArgumentException("Wrong realtime context");
    return t.scope();
  }
}
