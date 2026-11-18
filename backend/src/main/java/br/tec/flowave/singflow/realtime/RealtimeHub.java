package br.tec.flowave.singflow.realtime;

import br.tec.flowave.singflow.audit.SessionChanged;
import br.tec.flowave.singflow.identity.AccountChanged;
import jakarta.annotation.PreDestroy;
import jakarta.servlet.http.HttpSession;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.*;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.*;
import tools.jackson.databind.ObjectMapper;

/** Bounded invalidation transport. REST remains the source of truth. */
@Component
class RealtimeHub extends TextWebSocketHandler {
  private static final CloseStatus DENIED=new CloseStatus(4001,"Access ended");
  static class Client {
    final WebSocketSession socket;
    final HttpSession http;
    final long opened=System.currentTimeMillis();
    volatile long pong=opened;
    volatile RealtimeAccess.Scope scope;
    volatile Set<UUID> sessions=Set.of();
    Client(WebSocketSession socket){this.socket=new ConcurrentWebSocketSessionDecorator(socket,2000,8192);this.http=(HttpSession)socket.getAttributes().get("httpSession");}
    boolean httpActive(){try{return http!=null && (http.getMaxInactiveInterval()<=0 || System.currentTimeMillis()-http.getLastAccessedTime()<http.getMaxInactiveInterval()*1000L);}catch(IllegalStateException e){return false;}}
  }
  private final RealtimeAccess access;
  private final RealtimeTickets tickets;
  private final ObjectMapper json;
  private final Map<String,Client> clients=new ConcurrentHashMap<>();
  private final Set<UUID> dirty=ConcurrentHashMap.newKeySet();
  private final Set<String> accounts=ConcurrentHashMap.newKeySet();
  private final AtomicBoolean dispatching=new AtomicBoolean();
  // One bounded worker keeps all socket/database work off committing request threads.
  private final ExecutorService worker=new ThreadPoolExecutor(1,1,0,TimeUnit.SECONDS,new ArrayBlockingQueue<>(1),new ThreadPoolExecutor.AbortPolicy());
  RealtimeHub(RealtimeAccess access,RealtimeTickets tickets,ObjectMapper json){this.access=access;this.tickets=tickets;this.json=json;}
  @Override public void afterConnectionEstablished(WebSocketSession socket)throws Exception{
    if(clients.size()>=1000){socket.close(CloseStatus.SERVICE_OVERLOAD);return;}
    var client=new Client(socket);
    if(!client.httpActive() || clients.values().stream().filter(c->c.http!=null && c.http.getId().equals(client.http.getId())).count()>=8){socket.close(DENIED);return;}
    socket.setTextMessageSizeLimit(512);
    clients.put(socket.getId(),client);
  }
  @Override protected void handleTextMessage(WebSocketSession socket,TextMessage message){
    Client c=clients.get(socket.getId());if(c==null)return;
    try{
      if(c.scope!=null || !c.httpActive())throw new IllegalArgumentException();
      var input=json.readTree(message.getPayload());
      if(!"authenticate".equals(input.path("type").asText()))throw new IllegalArgumentException();
      c.scope=tickets.consume(input.path("ticket").asText(),c.http.getId(),socket.getUri().getPath());
      if(!access.active(c.scope))throw new IllegalArgumentException();
      c.sessions=access.sessions(c.scope);
      send(c,"ready");
    }catch(Exception e){close(c,DENIED);}
  }
  @Override protected void handlePongMessage(WebSocketSession socket,PongMessage message){var c=clients.get(socket.getId());if(c!=null)c.pong=System.currentTimeMillis();}
  @Override public void afterConnectionClosed(WebSocketSession socket,CloseStatus status){clients.remove(socket.getId());}
  @Override public void handleTransportError(WebSocketSession socket,Throwable error){var c=clients.get(socket.getId());if(c!=null)close(c,CloseStatus.SERVER_ERROR);}
  @TransactionalEventListener(phase=TransactionPhase.AFTER_COMMIT)
  public void changed(SessionChanged event){dirty.add(event.session());}
  @TransactionalEventListener(phase=TransactionPhase.AFTER_COMMIT)
  public void accountChanged(AccountChanged event){accounts.add(event.email());}
  @Scheduled(scheduler="realtimeScheduler",fixedDelay=150)
  void flush(){
    if((dirty.isEmpty() && accounts.isEmpty()) || !dispatching.compareAndSet(false,true))return;
    try{worker.execute(()->{try{dispatch();}finally{dispatching.set(false);}});}catch(RejectedExecutionException e){dispatching.set(false);}
  }
  private void dispatch(){
    Set<UUID> changes=new HashSet<>();for(var id:dirty)if(dirty.remove(id))changes.add(id);
    Set<String> changedAccounts=new HashSet<>();for(var id:accounts)if(accounts.remove(id))changedAccounts.add(id);
    for(Client c:clients.values()){
      var scope=c.scope;if(scope==null)continue;
      boolean relevant=scope.kind().equals("participant")?changes.contains(scope.session()):!changes.isEmpty() || changedAccounts.contains(scope.actor());
      if(!relevant)continue;
      try{
        if(!c.httpActive()){close(c,new CloseStatus(4000,"Reauthenticate"));continue;}
        if(!access.active(scope)){send(c,"ended");close(c,DENIED);continue;}
        var allowed=access.sessions(scope);
        boolean changed=changes.stream().anyMatch(id->allowed.contains(id)||c.sessions.contains(id));
        c.sessions=allowed;
        if(changed || changedAccounts.contains(scope.actor()))send(c,"changed");
      }catch(Exception e){close(c,CloseStatus.SERVER_ERROR);}
    }
  }
  @Scheduled(scheduler="realtimeScheduler",fixedDelay=1000)
  void expireUnauthenticated(){for(Client c:clients.values())if(c.scope==null && System.currentTimeMillis()-c.opened>5000)close(c,DENIED);}
  @Scheduled(scheduler="realtimeScheduler",fixedDelay=20000)
  void heartbeat(){
    for(Client c:clients.values()){
      if(c.scope==null)continue;
      if(!c.httpActive() || System.currentTimeMillis()-c.pong>60000){close(c,new CloseStatus(4000,"Reconnect"));continue;}
      try{c.socket.sendMessage(new PingMessage());}catch(Exception e){close(c,CloseStatus.SERVER_ERROR);}
    }
  }
  private void send(Client c,String type)throws Exception{c.socket.sendMessage(new TextMessage(json.writeValueAsString(Map.of("type",type))));}
  private void close(Client c,CloseStatus status){clients.remove(c.socket.getId());try{c.socket.close(status);}catch(Exception ignored){}}
  @PreDestroy void shutdown(){worker.shutdownNow();for(Client c:clients.values())close(c,CloseStatus.GOING_AWAY);}
}
