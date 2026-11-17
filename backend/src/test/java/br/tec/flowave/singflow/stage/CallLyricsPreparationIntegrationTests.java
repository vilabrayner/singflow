package br.tec.flowave.singflow.stage;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import br.tec.flowave.singflow.catalog.LyricsSearch;
import br.tec.flowave.singflow.requests.AssistedRequests;
import br.tec.flowave.singflow.sessions.SessionAccess;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.*;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;

@Testcontainers
@SpringBootTest(properties={"SINGFLOW_ENRICHMENT_ENABLED=false","spring.application.name=singflow-prefetch-tests","SINGFLOW_HOST_EMAIL=","SINGFLOW_HOST_PASSWORD=","LASTFM_API_KEY=","SINGFLOW_CATALOG_SYNC_ENABLED=false","SINGFLOW_LYRICS_ENABLED=true","SINGFLOW_LYRICS_PREFETCH_ENABLED=true"})
class CallLyricsPreparationIntegrationTests {
 @Container @ServiceConnection static PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:17.6");
 @Autowired JdbcClient jdbc;@Autowired SessionAccess sessions;@Autowired AssistedRequests requests;@Autowired StageService stage;@Autowired PlatformTransactionManager transactions;
 @MockitoBean LyricsSearch search;
 String host;UUID session,operation;AssistedRequests.Registration participant;
 @BeforeEach void setup(){
   host=UUID.randomUUID()+"@example.test";jdbc.sql("INSERT INTO singflow.host_accounts(email,password_hash,role) VALUES(?,'unused','HOST')").param(host).update();
   session=UUID.randomUUID();operation=UUID.randomUUID();sessions.create(host,"Teste",session);sessions.transition(session,host,"OPEN");
   participant=requests.register(session,host,UUID.randomUUID(),"Ana",null,"Giz","Legião Urbana");
 }
 StageService.StageView confirm(){return stage.confirm(session,host,operation,participant.participant().id(),participant.request().id(),null,null);}
 @Test void warmsAfterCommitBeforeParticipantAcceptanceWithoutBlockingCall() throws Exception {
   var entered=new CountDownLatch(1);var release=new CountDownLatch(1);var finished=new CountDownLatch(1);var completed=new AtomicBoolean();
   when(search.find("Giz","Legião Urbana")).thenAnswer(i->{
     assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();entered.countDown();
     try{release.await(5,TimeUnit.SECONDS);return null;}finally{completed.set(true);finished.countDown();}
   });
   try{
     var view=confirm();assertThat(entered.await(2,TimeUnit.SECONDS)).isTrue();assertThat(completed.get()).isFalse();
     assertThat(view.active().acceptedAt()).isNull();assertThat(stage.snapshot(session,host).active().id()).isEqualTo(operation);
   }finally{release.countDown();assertThat(finished.await(2,TimeUnit.SECONDS)).isTrue();}
 }
 @Test void rolledBackOrFailedCallsNeverStartWarming(){
   new TransactionTemplate(transactions).execute(status->{confirm();verifyNoInteractions(search);status.setRollbackOnly();return null;});
   assertThat(stage.snapshot(session,host).active()).isNull();verifyNoInteractions(search);
   assertThatThrownBy(()->stage.confirm(session,host,operation,UUID.randomUUID(),null,null,null)).isInstanceOf(RuntimeException.class);verifyNoInteractions(search);
 }
 @Test void idempotentReplayDoesNotScheduleAnotherSearch(){
   confirm();verify(search,timeout(2000)).find("Giz","Legião Urbana");confirm();verify(search,after(200).times(1)).find("Giz","Legião Urbana");
 }
 @Test void providerFailureDoesNotRollBackTheCall(){
   when(search.find(anyString(),anyString())).thenThrow(new IllegalStateException("Simulated provider failure"));
   confirm();verify(search,timeout(2000)).find("Giz","Legião Urbana");assertThat(stage.snapshot(session,host).active().id()).isEqualTo(operation);
 }
}
