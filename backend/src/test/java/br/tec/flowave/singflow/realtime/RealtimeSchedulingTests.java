package br.tec.flowave.singflow.realtime;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import br.tec.flowave.singflow.audit.SessionChanged;
import java.net.URI;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.*;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.scheduling.annotation.*;
import org.springframework.web.socket.*;
import tools.jackson.databind.ObjectMapper;

class RealtimeSchedulingTests {
  static class SlowBackgroundWork {
    final CountDownLatch started = new CountDownLatch(1);
    final CountDownLatch release = new CountDownLatch(1);
    @Scheduled(scheduler = "taskScheduler", fixedDelay = 60000)
    public void tick() throws InterruptedException { started.countDown(); release.await(); }
  }

  @Configuration(proxyBeanMethods = false)
  @EnableScheduling
  @Import(RealtimeScheduling.class)
  static class Config {
    @Bean SlowBackgroundWork slow() { return new SlowBackgroundWork(); }
    @Bean RealtimeAccess access() { return mock(RealtimeAccess.class); }
    @Bean RealtimeTickets tickets() { return new RealtimeTickets(); }
    @Bean RealtimeHub hub(RealtimeAccess access, RealtimeTickets tickets) {
      return new RealtimeHub(access, tickets, new ObjectMapper());
    }
  }

  @Test void notificationsDoNotWaitForSlowBackgroundWork() throws Exception {
    try (var context = new AnnotationConfigApplicationContext(Config.class)) {
      var slow = context.getBean(SlowBackgroundWork.class);
      try {
        assertThat(slow.started.await(3, TimeUnit.SECONDS)).isTrue();
        var access = context.getBean(RealtimeAccess.class);
        var tickets = context.getBean(RealtimeTickets.class);
        var hub = context.getBean(RealtimeHub.class);
        var scope = new RealtimeAccess.Scope("participant", null, UUID.randomUUID(), UUID.randomUUID());
        var http = new MockHttpSession();
        var socket = mock(WebSocketSession.class);
        when(socket.getId()).thenReturn("live-participant");
        when(socket.isOpen()).thenReturn(true);
        when(socket.getAttributes()).thenReturn(Map.of("httpSession", http));
        when(socket.getUri()).thenReturn(URI.create("ws://localhost/api/participation/" + scope.session() + "/realtime/ws"));
        when(access.active(scope)).thenReturn(true);
        when(access.sessions(scope)).thenReturn(Set.of(scope.session()));
        var messages = new LinkedBlockingQueue<String>();
        doAnswer(call -> {
          if (call.getArgument(0) instanceof TextMessage text) messages.add(text.getPayload());
          return null;
        }).when(socket).sendMessage(any());
        hub.afterConnectionEstablished(socket);
        hub.handleTextMessage(socket, new TextMessage("{\"type\":\"authenticate\",\"ticket\":\"" + tickets.issue(scope, http.getId()) + "\"}"));
        assertThat(messages.poll(3, TimeUnit.SECONDS)).contains("ready");
        hub.changed(new SessionChanged(scope.session()));
        assertThat(messages.poll(3, TimeUnit.SECONDS))
            .as("A blocked catalog task must not delay a committed stage notification")
            .isEqualTo("{\"type\":\"changed\"}");
        assertThat(slow.release.getCount()).isEqualTo(1);
      } finally { slow.release.countDown(); }
    }
  }
}
