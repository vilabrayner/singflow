package br.tec.flowave.singflow.realtime;

import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.security.Principal;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
class RealtimeEndpoints {
  record Request(@NotNull @jakarta.validation.constraints.Pattern(regexp="host|musician") String perspective) {}
  record Connection(String ticket,String socketPath) {}
  private final RealtimeAccess access;
  private final RealtimeTickets tickets;
  RealtimeEndpoints(RealtimeAccess access,RealtimeTickets tickets){this.access=access;this.tickets=tickets;}
  @PostMapping("/api/public/tv/{session}/realtime/tickets")
  ResponseEntity<Connection> television(@PathVariable UUID session,HttpServletRequest request){
    var scope=access.television(session);
    return ResponseEntity.ok().cacheControl(CacheControl.noStore())
      .body(new Connection(tickets.issue(scope,request.getSession().getId()),"/realtime/ws"));
  }
  @PostMapping("/api/realtime/tickets")
  ResponseEntity<Connection> staff(@Valid @RequestBody Request input,Principal actor,HttpServletRequest request){
    var scope=access.staff(actor.getName(),input.perspective());
    return ResponseEntity.ok().cacheControl(CacheControl.noStore())
        .body(new Connection(tickets.issue(scope,request.getSession().getId()),"/realtime/ws"));
  }
  @PostMapping("/api/participation/{session}/realtime/tickets")
  ResponseEntity<Connection> participant(@PathVariable UUID session,HttpServletRequest request){
    String raw=request.getCookies()==null?null:Arrays.stream(request.getCookies())
        .filter(c->c.getName().equals("SF_PARTICIPANT")).map(Cookie::getValue).findFirst().orElse(null);
    var scope=access.participant(session,raw,request.getHeader("X-SingFlow-Participant"));
    return ResponseEntity.ok().cacheControl(CacheControl.noStore())
        .body(new Connection(tickets.issue(scope,request.getSession().getId()),"/participation/"+session+"/realtime/ws"));
  }
}
