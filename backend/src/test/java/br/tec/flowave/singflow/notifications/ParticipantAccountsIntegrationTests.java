package br.tec.flowave.singflow.notifications;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import br.tec.flowave.singflow.audience.*;
import br.tec.flowave.singflow.identity.*;
import br.tec.flowave.singflow.requests.AssistedRequests;
import br.tec.flowave.singflow.sessions.SessionAccess;
import br.tec.flowave.singflow.stage.*;
import jakarta.servlet.http.Cookie;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;

@Testcontainers
@AutoConfigureMockMvc
@SpringBootTest(properties={"SINGFLOW_HOST_EMAIL=","SINGFLOW_HOST_PASSWORD=","LASTFM_API_KEY=","SINGFLOW_ENRICHMENT_ENABLED=false","SINGFLOW_LYRICS_PREFETCH_ENABLED=false","SINGFLOW_CATALOG_SYNC_ENABLED=false","SINGFLOW_NOTIFICATIONS_WORKER_ENABLED=false"})
class ParticipantAccountsIntegrationTests {
  @Container @ServiceConnection static PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:17.6");
  static final String[] KEYS;
  static {try{KEYS=NotificationPolicyTests.keys();}catch(Exception e){throw new ExceptionInInitializerError(e);}}
  @DynamicPropertySource static void properties(DynamicPropertyRegistry registry){
    var env=NotificationPolicyTests.whatsapp();
    for(String key:List.of("SINGFLOW_WHATSAPP_ENABLED","SINGFLOW_WHATSAPP_PHONE_NUMBER_ID","SINGFLOW_WHATSAPP_BUSINESS_PHONE","SINGFLOW_WHATSAPP_API_VERSION","SINGFLOW_WHATSAPP_ACCESS_TOKEN","SINGFLOW_WHATSAPP_APP_SECRET","SINGFLOW_WHATSAPP_VERIFY_TOKEN","SINGFLOW_WHATSAPP_CALL_TEMPLATE"))registry.add(key,()->env.getProperty(key));
    registry.add("SINGFLOW_WEB_PUSH_ENABLED",()->"true");registry.add("SINGFLOW_WEB_PUSH_PUBLIC_KEY",()->KEYS[0]);registry.add("SINGFLOW_WEB_PUSH_PRIVATE_KEY",()->KEYS[1]);registry.add("SINGFLOW_WEB_PUSH_SUBJECT",()->"mailto:test@example.test");
  }
  @Autowired JdbcClient jdbc; @Autowired MockMvc mvc; @Autowired AccountLifecycle lifecycle;
  @Autowired AudienceAccounts accounts; @Autowired AudienceService audience; @Autowired SessionAccess sessions;
  @Autowired StageService stage; @Autowired AssistedRequests requests; @Autowired NotificationPreferences preferences;
  @Autowired NotificationOutbox outbox; @Autowired PlatformTransactionManager transactions; @Autowired ApplicationEventPublisher events;
  @MockitoBean VerificationMail mail; @MockitoBean NotificationTransport transport;
  String host,email,other,token,code; UUID session,participant,request;
  @BeforeEach void setup(){
    host=account("HOST");email=account("PARTICIPANT");other=account("PARTICIPANT");
    session=UUID.randomUUID();sessions.create(host,"Karaokê",session);sessions.transition(session,host,"OPEN");
    var path=URI.create(audience.entryLink(session,host,UUID.randomUUID()).url()).getPath();code=path.substring(path.lastIndexOf('/')+1);
    token=audience.prepare(session,code,null,"browser-"+UUID.randomUUID()).token();
    var view=audience.join(session,token,code,"Ana",null,"Giz","Legião Urbana");participant=view.participant().id();request=view.requests().getFirst().id();
  }
  String account(String role){var email=UUID.randomUUID()+"@example.test";jdbc.sql("INSERT INTO singflow.host_accounts(email,password_hash,role,display_name) VALUES(?,'unused',?,'Ana')").params(email,role).update();return email;}
  void link(){audience.linkAccount(session,token,participant.toString(),email);}
  long jobs(){return jdbc.sql("SELECT count(*) FROM singflow.participant_notification_jobs WHERE session_id=?").param(session).query(Long.class).single();}
  UUID call(){return stage.confirm(session,host,UUID.randomUUID(),participant,request,null,null).active().id();}
  void whatsapp(){
    var url=URI.create(preferences.connect(email,true).url());
    String text=URLDecoder.decode(url.getRawQuery().substring("text=".length()),StandardCharsets.UTF_8);
    preferences.inbound("5581"+String.format("%09d",Math.floorMod(UUID.randomUUID().getLeastSignificantBits(),1_000_000_000L)),text);
  }
  @Test void participantNeedsEmailConfirmationButNeverAdminApproval()throws Exception{
    var captured=new AtomicReference<String>();doAnswer(i->{captured.set(i.getArgument(1));return null;}).when(mail).send(anyString(),anyString());
    String registered=UUID.randomUUID()+"@example.test";
    lifecycle.register("Participante",registered,"participant-password-2026","PARTICIPANT");
    assertThat(lifecycle.get(registered).active()).isFalse();
    assertThatThrownBy(()->accounts.profile(registered)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    lifecycle.verify(captured.get());assertThat(lifecycle.get(registered).active()).isTrue();
    assertThat(lifecycle.get(registered).status()).isEqualTo("APPROVED");
    assertThatThrownBy(()->lifecycle.verify(captured.get())).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    mvc.perform(get("/api/participant-account/me").with(user(registered).roles("PARTICIPANT"))).andExpect(status().isOk()).andExpect(jsonPath("$.email").value(registered));
    mvc.perform(get("/api/sessions").with(user(registered).roles("PARTICIPANT"))).andExpect(status().isForbidden());
    mvc.perform(get("/api/admin/accounts").with(user(registered).roles("PARTICIPANT"))).andExpect(status().isForbidden());
  }
  @Test void linkingRequiresTheCookieAndAccountAndRecoveryPreservesTheExistingParticipation()throws Exception{
    var before=audience.me(session,token);
    mvc.perform(post("/api/participation/"+session+"/account-link").with(csrf())).andExpect(status().isUnauthorized());
    mvc.perform(post("/api/participation/"+session+"/account-link").with(csrf()).with(user(email).roles("PARTICIPANT"))).andExpect(status().isUnauthorized());
    mvc.perform(post("/api/participation/"+session+"/account-link").with(csrf()).with(user(email).roles("PARTICIPANT")).cookie(new Cookie("SF_PARTICIPANT",token)).header("X-SingFlow-Participant",participant)).andExpect(status().isNoContent());
    assertThat(accounts.sessions(email)).hasSize(1);assertThat(accounts.sessions(other)).isEmpty();
    assertThatThrownBy(()->audience.linkAccount(session,token,participant.toString(),other)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    assertThatThrownBy(()->audience.restoreAccount(session,other,null,"foreign",null)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    var restored=audience.restoreAccount(session,email,null,"another-browser",null);
    var after=audience.me(session,restored.token());
    assertThat(after.participant().id()).isEqualTo(before.participant().id());assertThat(after.participant().checkInOrder()).isEqualTo(before.participant().checkInOrder());assertThat(after.requests()).isEqualTo(before.requests());
    assertThatThrownBy(()->audience.me(session,token)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    audience.leave(session,restored.token());var returned=audience.restoreAccount(session,email,null,"third-browser",null);assertThat(audience.me(session,returned.token()).canReturn()).isTrue();
  }
  @Test void aHostRemovalCannotBeBypassedByAccountRecovery(){
    link();requests.leave(session,host,participant);
    assertThatThrownBy(()->audience.restoreAccount(session,email,null,"new-browser",null)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
  }
  @Test void aSignedInJoinIsLinkedAtomicallyAndAnotherJoinCannotDuplicateIt(){
    String fresh=audience.prepare(session,code,null,"fresh-browser").token();
    var view=audience.joinForAccount(session,fresh,code,"Bruno",null,"Será","Legião Urbana",null,email);
    assertThat(accounts.participant(email,session)).isEqualTo(view.participant().id());
    String retry=audience.prepare(session,code,null,"retry-browser").token();
    assertThatThrownBy(()->audience.joinForAccount(session,retry,code,"Outra pessoa",null,"Outra música",null,null,email)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    assertThat(accounts.sessions(email)).hasSize(1);
  }
  @Test void webhookVerifiesSignatureAndNumberOwnershipAndHonorsOptOut()throws Exception{
    var url=URI.create(preferences.connect(email,true).url());String text=URLDecoder.decode(url.getRawQuery().substring(5),StandardCharsets.UTF_8);
    String body="{\"entry\":[{\"changes\":[{\"value\":{\"metadata\":{\"phone_number_id\":\"123456789\"},\"messages\":[{\"type\":\"text\",\"from\":\"5581999999999\",\"text\":{\"body\":\""+text+"\"}}]}}]}]}";
    mvc.perform(post("/api/public/whatsapp/webhook").contentType("application/json").content(body)).andExpect(status().isForbidden());
    assertThat(accounts.profile(email).whatsappPhone()).isNull();
    var mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec("test-only-secret".getBytes(StandardCharsets.UTF_8),"HmacSHA256"));String signature="sha256="+HexFormat.of().formatHex(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
    mvc.perform(post("/api/public/whatsapp/webhook").contentType("application/json").content(body).header("X-Hub-Signature-256",signature)).andExpect(status().isOk());
    assertThat(accounts.profile(email).whatsappPhone()).isEqualTo("+5581999999999");assertThat(accounts.profile(email).whatsappEnabled()).isTrue();
    mvc.perform(post("/api/public/whatsapp/webhook").contentType("application/json").content(body).header("X-Hub-Signature-256",signature)).andExpect(status().isOk());
    preferences.inbound("5581999999999","SAIR");assertThat(accounts.profile(email).whatsappEnabled()).isFalse();
    mvc.perform(get("/api/public/whatsapp/webhook").param("hub.mode","subscribe").param("hub.verify_token","test-only-verification").param("hub.challenge","1234")).andExpect(status().isOk()).andExpect(content().string("1234"));
  }
  @Test void subscriptionsRequireConsentAndCannotBeClaimedByAnotherAccount(){
    String endpoint="https://fcm.googleapis.com/test-"+UUID.randomUUID();String auth=Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[16]);
    assertThatThrownBy(()->preferences.subscribe(email,endpoint,KEYS[0],auth,false)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    preferences.subscribe(email,endpoint,KEYS[0],auth,true);
    assertThatThrownBy(()->preferences.subscribe(other,endpoint,KEYS[0],auth,true)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    assertThat(accounts.profile(other).pushEnabled()).isFalse();
    preferences.unsubscribe(email,endpoint);
    assertThat(jdbc.sql("SELECT active FROM singflow.web_push_subscriptions WHERE endpoint=?").param(endpoint).query(Boolean.class).single()).isFalse();
  }
  @Test void outboxRollsBackAndClaimsAreExclusiveAndAmbiguousDeliveryIsNotRetried()throws Exception{
    link();whatsapp();
    new TransactionTemplate(transactions).executeWithoutResult(tx->{call();tx.setRollbackOnly();});assertThat(jobs()).isZero();
    UUID call=call();assertThat(jobs()).isEqualTo(1);
    new TransactionTemplate(transactions).executeWithoutResult(tx->events.publishEvent(new CallConfirmed(session,call,"Giz","Legião Urbana")));assertThat(jobs()).isEqualTo(1);
    var pool=Executors.newFixedThreadPool(2);
    try{
      var claims=pool.invokeAll(List.of(()->outbox.claim(),()->outbox.claim())).stream().map(f->{try{return (Optional<NotificationOutbox.Claim>)f.get();}catch(Exception e){throw new RuntimeException(e);}}).filter(Optional::isPresent).map(Optional::get).toList();
      assertThat(claims).hasSize(1);assertThat(outbox.delivery(claims.getFirst())).isPresent();
      outbox.finish(claims.getFirst(),new NotificationTransport.Result("UNKNOWN","TRANSPORT_UNCERTAIN",null));assertThat(outbox.claim()).isEmpty();
    }finally{pool.shutdownNow();}
    verifyNoInteractions(transport);
  }
  @Test void completedOrUnsubscribedCallsNeverReachTheProvider(){
    link();whatsapp();UUID id=call();stage.resolve(session,host,id,"COMPLETED");
    var worker=new NotificationWorker(new NotificationConfig(NotificationPolicyTests.whatsapp()),outbox,transport);
    try{worker.processOne();}finally{worker.stop();}
    verifyNoInteractions(transport);
    assertThat(jdbc.sql("SELECT state FROM singflow.participant_notification_jobs WHERE session_id=?").param(session).query(String.class).single()).isEqualTo("SKIPPED");
  }
}
