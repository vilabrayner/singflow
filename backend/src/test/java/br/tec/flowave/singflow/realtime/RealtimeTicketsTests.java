package br.tec.flowave.singflow.realtime;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.time.*;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class RealtimeTicketsTests {
  @Test void ticketsAreSingleUseBoundToBrowserPathAndExpiry(){
    Clock clock=mock(Clock.class);
    Instant now=Instant.parse("2026-11-18T12:00:00Z");
    when(clock.instant()).thenReturn(now);
    var tickets=new RealtimeTickets(clock);
    var scope=new RealtimeAccess.Scope("participant",null,UUID.randomUUID(),UUID.randomUUID());
    String path="/api/participation/"+scope.session()+"/realtime/ws";
    String first=tickets.issue(scope,"browser");
    assertThat(tickets.consume(first,"browser",path)).isEqualTo(scope);
    assertThatThrownBy(()->tickets.consume(first,"browser",path)).isInstanceOf(IllegalArgumentException.class);
    String other=tickets.issue(scope,"browser");
    assertThatThrownBy(()->tickets.consume(other,"another-browser",path)).isInstanceOf(IllegalArgumentException.class);
    String wrongPath=tickets.issue(scope,"browser");
    assertThatThrownBy(()->tickets.consume(wrongPath,"browser","/api/realtime/ws")).isInstanceOf(IllegalArgumentException.class);
    String expired=tickets.issue(scope,"browser");
    when(clock.instant()).thenReturn(now.plusSeconds(30));
    assertThatThrownBy(()->tickets.consume(expired,"browser",path)).isInstanceOf(IllegalArgumentException.class);
  }
  @Test void pendingTicketsAreBoundedAndExpire(){
    Clock clock=mock(Clock.class);Instant now=Instant.now();when(clock.instant()).thenReturn(now);
    var tickets=new RealtimeTickets(clock);
    var scope=new RealtimeAccess.Scope("host","host@example.test",null,null);
    for(int i=0;i<8;i++)tickets.issue(scope,"browser");
    assertThatThrownBy(()->tickets.issue(scope,"browser")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    when(clock.instant()).thenReturn(now.plusSeconds(31));
    assertThat(tickets.issue(scope,"browser")).hasSize(43);
  }
}
