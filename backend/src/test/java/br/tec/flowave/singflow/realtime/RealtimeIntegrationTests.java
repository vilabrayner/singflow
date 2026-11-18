package br.tec.flowave.singflow.realtime;

import static org.assertj.core.api.Assertions.*;

import br.tec.flowave.singflow.audience.AudienceService;
import br.tec.flowave.singflow.audit.AuditTrail;
import br.tec.flowave.singflow.musicians.MusicianAccess;
import br.tec.flowave.singflow.sessions.SessionAccess;
import jakarta.annotation.PreDestroy;
import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.*;

@Testcontainers
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
  "SINGFLOW_PUBLIC_APP_URL=http://127.0.0.1:4200", "SINGFLOW_HOST_EMAIL=", "SINGFLOW_HOST_PASSWORD=",
  "SINGFLOW_ENRICHMENT_ENABLED=false", "SINGFLOW_LYRICS_PREFETCH_ENABLED=false", "SINGFLOW_CATALOG_SYNC_ENABLED=false", "LASTFM_API_KEY="})
class RealtimeIntegrationTests {
  @Container @ServiceConnection static PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:17.6");
  @Value("${local.server.port}") int port;
  @Autowired JdbcClient jdbc;
  @Autowired AudienceService audience;
  @Autowired SessionAccess sessions;
  @Autowired MusicianAccess musicians;
  @Autowired AuditTrail audit;
  @Autowired PlatformTransactionManager transactions;
  @Autowired PasswordEncoder passwords;
  @Autowired ObjectMapper json;
  String host, musician, token;
  UUID session, participant;
  List<Wire> wires=new ArrayList<>();
  @BeforeEach void setup() throws Exception {
    host=account("HOST"); musician=account("MUSICIAN");
    session=UUID.randomUUID();sessions.create(host,"Realtime",session);sessions.transition(session,host,"OPEN");
    String path=URI.create(audience.entryLink(session,host,UUID.randomUUID()).url()).getPath();
    String code=path.substring(path.lastIndexOf('/')+1);
    token=audience.prepare(session,code,null,"browser-"+UUID.randomUUID()).token();
    participant=audience.join(session,token,code,"Ana",null,"Giz","Legião Urbana").participant().id();
  }
  String account(String role){
    String email=UUID.randomUUID()+"@example.test";
    jdbc.sql("INSERT INTO singflow.host_accounts(email,password_hash,role) VALUES(?,?,?)").params(email,passwords.encode("test-password-only"),role).update();
    return email;
  }
  @AfterEach void cleanup(){wires.forEach(w->w.socket.abort());}

  class Browser {
    final CookieManager cookies=new CookieManager(null,CookiePolicy.ACCEPT_ALL);
    final HttpClient http=HttpClient.newBuilder().cookieHandler(cookies).connectTimeout(Duration.ofSeconds(5)).build();
    final String participantToken;
    Browser(String token){participantToken=token;}
    HttpResponse<String> post(String path,String body,boolean csrf,String contentType)throws Exception{
      var builder=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+path)).timeout(Duration.ofSeconds(5));
      if(csrf){
        var response=http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/auth/csrf")).GET().build(),HttpResponse.BodyHandlers.ofString());
        var value=json.readTree(response.body());
        builder.header(value.path("headerName").asText(),value.path("token").asText());
      }
      if(participantToken!=null)builder.header("Cookie","SF_PARTICIPANT="+participantToken).header("X-SingFlow-Participant",participant.toString());
      return http.send(builder.header("Content-Type",contentType).POST(HttpRequest.BodyPublishers.ofString(body)).build(),HttpResponse.BodyHandlers.ofString());
    }
    JsonNode ticket(String perspective)throws Exception{
      String path=perspective.equals("participant")?"/api/participation/"+session+"/realtime/tickets":"/api/realtime/tickets";
      var response=post(path,"{\"perspective\":\""+perspective+"\"}",true,"application/json");
      assertThat(response.statusCode()).isEqualTo(200);
      assertThat(response.headers().firstValue("cache-control").orElse("")).contains("no-store");
      return json.readTree(response.body());
    }
    void login(String email)throws Exception{
      var response=post("/api/auth/login","email="+URLEncoder.encode(email,java.nio.charset.StandardCharsets.UTF_8)+"&password=test-password-only",true,"application/x-www-form-urlencoded");
      assertThat(response.statusCode()).isEqualTo(204);
    }
    WebSocket.Builder socket(String path,String origin){
      String cookie=cookies.getCookieStore().getCookies().stream().map(HttpCookie::toString).collect(java.util.stream.Collectors.joining("; "));
      return HttpClient.newHttpClient().newWebSocketBuilder().connectTimeout(Duration.ofSeconds(5)).header("Origin",origin).header("Cookie",cookie);
    }
  }
  static class Wire implements WebSocket.Listener {
    final BlockingQueue<String> messages=new LinkedBlockingQueue<>();
    final CompletableFuture<Integer> closed=new CompletableFuture<>();
    final StringBuilder text=new StringBuilder();
    WebSocket socket;
    @Override public void onOpen(WebSocket socket){this.socket=socket;socket.request(1);}
    @Override public CompletionStage<?> onText(WebSocket socket,CharSequence data,boolean last){text.append(data);if(last){messages.add(text.toString());text.setLength(0);}socket.request(1);return null;}
    @Override public CompletionStage<?> onClose(WebSocket socket,int status,String reason){closed.complete(status);return null;}
    @Override public void onError(WebSocket socket,Throwable error){closed.completeExceptionally(error);}
    String next()throws Exception{return messages.poll(3,TimeUnit.SECONDS);}
    void quiet()throws Exception{assertThat(messages.poll(400,TimeUnit.MILLISECONDS)).isNull();}
  }
  Wire open(Browser browser,JsonNode ticket)throws Exception{
    var wire=new Wire();wires.add(wire);
    wire.socket=browser.socket(ticket.path("socketPath").asText(),"http://127.0.0.1:4200")
      .buildAsync(URI.create("ws://127.0.0.1:"+port+"/api"+ticket.path("socketPath").asText()),wire).get(5,TimeUnit.SECONDS);
    wire.socket.sendText(json.writeValueAsString(Map.of("type","authenticate","ticket",ticket.path("ticket").asText())),true).join();
    return wire;
  }
  void settle(Wire wire)throws Exception {
    assertThat(wire.next()).isEqualTo("{\"type\":\"ready\"}");
    // The initial REST snapshot covers any fixture changes that were committed before subscribe.
    Thread.sleep(350);wire.messages.clear();
  }
  void change(UUID id,boolean rollback){
    new TransactionTemplate(transactions).executeWithoutResult(status->{audit.record(host,id,"REALTIME_TEST",id);if(rollback)status.setRollbackOnly();});
  }
  @Test void nativeSocketDeliversOnlyCommittedAuthorizedChangesAndSingleUseTicket()throws Exception{
    var browser=new Browser(token);var ticket=browser.ticket("participant");var wire=open(browser,ticket);settle(wire);
    change(session,true);wire.quiet();
    UUID other=UUID.randomUUID();sessions.create(host,"Outra",other);change(other,false);wire.quiet();
    change(session,false);assertThat(wire.next()).isEqualTo("{\"type\":\"changed\"}");
    var duplicate=open(browser,ticket);assertThat(duplicate.closed.get(3,TimeUnit.SECONDS)).isEqualTo(4001);assertThat(duplicate.messages).isEmpty();
    sessions.transition(session,host,"CLOSED");assertThat(wire.next()).isEqualTo("{\"type\":\"ended\"}");assertThat(wire.closed.get(3,TimeUnit.SECONDS)).isEqualTo(4001);
  }
  @Test void participantRecoveryRevokesTheOldSocketAndDeniesNewTickets()throws Exception{
    var browser=new Browser(token);var wire=open(browser,browser.ticket("participant"));settle(wire);
    new TransactionTemplate(transactions).executeWithoutResult(status->{jdbc.sql("UPDATE singflow.participant_grants SET revoked=true WHERE session_id=? AND participant_id=?").params(session,participant).update();audit.record(host,session,"MOBILE_ACCESS_LINKED",participant);});
    assertThat(wire.next()).isEqualTo("{\"type\":\"ended\"}");assertThat(wire.closed.get(3,TimeUnit.SECONDS)).isEqualTo(4001);
    assertThat(browser.post("/api/participation/"+session+"/realtime/tickets","{}",true,"application/json").statusCode()).isBetween(400,499);
  }
  @Test void musicianReceivesGrantAndRevocationWithoutAccessToUnrelatedSessions()throws Exception{
    var browser=new Browser(null);browser.login(musician);var wire=open(browser,browser.ticket("musician"));settle(wire);
    change(session,false);wire.quiet();
    musicians.grant(session,host,UUID.randomUUID(),musician);assertThat(wire.next()).isEqualTo("{\"type\":\"changed\"}");
    musicians.revoke(session,host,musician);assertThat(wire.next()).isEqualTo("{\"type\":\"changed\"}");
    change(session,false);wire.quiet();
    browser.post("/api/auth/logout","{}",true,"application/json");change(session,false);
    assertThat(wire.closed.get(3,TimeUnit.SECONDS)).isIn(4000,1008);
  }
  @Test void staffTicketsRequireLoginCsrfAndHostRoleAndHandshakeRejectsForeignOrigin()throws Exception{
    var browser=new Browser(null);
    assertThat(browser.post("/api/realtime/tickets","{\"perspective\":\"host\"}",true,"application/json").statusCode()).isEqualTo(401);
    browser.login(musician);
    assertThat(browser.post("/api/realtime/tickets","{\"perspective\":\"musician\"}",false,"application/json").statusCode()).isEqualTo(403);
    assertThat(browser.post("/api/realtime/tickets","{\"perspective\":\"host\"}",true,"application/json").statusCode()).isEqualTo(403);
    var ticket=browser.ticket("musician");
    assertThatThrownBy(()->browser.socket("/api/realtime/ws","https://foreign.example.test").buildAsync(URI.create("ws://127.0.0.1:"+port+"/api/realtime/ws"),new Wire()).join()).hasCauseInstanceOf(WebSocketHandshakeException.class);
  }
}
