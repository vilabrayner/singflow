package br.tec.flowave.singflow.realtime;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import br.tec.flowave.singflow.audit.SessionChanged;
import java.net.URI;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.web.socket.*;
import tools.jackson.databind.ObjectMapper;

class RealtimeHubTests {
  RealtimeAccess access=mock(RealtimeAccess.class);
  RealtimeTickets tickets=new RealtimeTickets();
  RealtimeHub hub=new RealtimeHub(access,tickets,new ObjectMapper());
  @AfterEach void cleanup(){hub.shutdown();}
  @Test void heartbeatNeverReadsDatabaseAndRevokedAccessClosesBeforeChangeDelivery()throws Exception{
    UUID session=UUID.randomUUID();var scope=new RealtimeAccess.Scope("participant",null,session,UUID.randomUUID());
    var http=new MockHttpSession();var socket=mock(WebSocketSession.class);
    when(socket.getId()).thenReturn("socket");when(socket.isOpen()).thenReturn(true);
    when(socket.getAttributes()).thenReturn(Map.of("httpSession",http));
    when(socket.getUri()).thenReturn(URI.create("ws://localhost/api/participation/"+session+"/realtime/ws"));
    when(access.active(scope)).thenReturn(true);when(access.sessions(scope)).thenReturn(Set.of(session));
    var sent=new LinkedBlockingQueue<WebSocketMessage<?>>();doAnswer(i->{sent.add(i.getArgument(0));return null;}).when(socket).sendMessage(any());
    hub.afterConnectionEstablished(socket);
    hub.handleTextMessage(socket,new TextMessage("{\"type\":\"authenticate\",\"ticket\":\""+tickets.issue(scope,http.getId())+"\"}"));
    assertThat(sent.poll(1,TimeUnit.SECONDS).getPayload().toString()).contains("ready");
    clearInvocations(access);
    hub.heartbeat();assertThat(sent.poll(1,TimeUnit.SECONDS)).isInstanceOf(PingMessage.class);verifyNoInteractions(access);
    // Changes from an unrelated session do not even revalidate this participant.
    hub.changed(new SessionChanged(UUID.randomUUID()));hub.flush();
    Thread.sleep(100);verifyNoInteractions(access);
    when(access.active(scope)).thenReturn(false);
    hub.changed(new SessionChanged(session));hub.flush();
    assertThat(sent.poll(2,TimeUnit.SECONDS).getPayload().toString()).contains("ended").doesNotContain("changed");
    verify(socket,timeout(1000)).close(argThat(status->status.getCode()==4001));
  }
  @Test void authenticationIsRequiredAndForeignTicketsCannotSubscribe()throws Exception{
    var http=new MockHttpSession();var socket=mock(WebSocketSession.class);
    when(socket.getId()).thenReturn("unauthorized");when(socket.isOpen()).thenReturn(true);
    when(socket.getAttributes()).thenReturn(Map.of("httpSession",http));
    when(socket.getUri()).thenReturn(URI.create("ws://localhost/api/realtime/ws"));
    var scope=new RealtimeAccess.Scope("host","host@example.test",null,null);
    hub.afterConnectionEstablished(socket);
    hub.handleTextMessage(socket,new TextMessage("{\"type\":\"authenticate\",\"ticket\":\""+tickets.issue(scope,"different-browser")+"\"}"));
    verify(socket).close(argThat(status->status.getCode()==4001));verifyNoInteractions(access);
  }
}
