package br.tec.flowave.singflow.audience;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import br.tec.flowave.singflow.catalog.LyricsSearch;
import br.tec.flowave.singflow.sessions.SessionAccess;
import br.tec.flowave.singflow.stage.StageService;
import jakarta.servlet.http.Cookie;
import java.net.URI;
import java.util.UUID;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;

@Testcontainers
@SpringBootTest(properties={"SINGFLOW_ENRICHMENT_ENABLED=false","SINGFLOW_LYRICS_PREFETCH_ENABLED=false","spring.application.name=singflow-lyrics-tests","SINGFLOW_HOST_EMAIL=","SINGFLOW_HOST_PASSWORD=","LASTFM_API_KEY=","SINGFLOW_CATALOG_SYNC_ENABLED=false"})
@AutoConfigureMockMvc
class AudienceLyricsIntegrationTests {
 @Container @ServiceConnection static PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:17.6");
 @Autowired JdbcClient jdbc;@Autowired AudienceService audience;@Autowired SessionAccess sessions;@Autowired StageService stage;@Autowired MockMvc mvc;
 @MockitoBean LyricsSearch search;
 @Autowired br.tec.flowave.singflow.catalog.LyricsSessionCache cache;
 @Autowired org.springframework.transaction.PlatformTransactionManager transactions;
 String host,token,otherToken;UUID session,call;
 private final java.util.Set<UUID> fixtureSessions=new java.util.HashSet<>();
 @AfterEach void releaseFixtureCache(){
   // Spring retains the context/cache while Mockito resets its provider between test methods.
   // Release only this test's sessions, preserving production sharing semantics.
   fixtureSessions.forEach(cache::closeSession);
 }
 @BeforeEach void setup(){
   host=UUID.randomUUID()+"@example.test";jdbc.sql("INSERT INTO singflow.host_accounts(email,password_hash,role) VALUES(?,'unused','HOST')").param(host).update();
   session=UUID.randomUUID();fixtureSessions.add(session);sessions.create(host,"Teste",session);sessions.transition(session,host,"OPEN");
   String path=URI.create(audience.entryLink(session,host,UUID.randomUUID()).url()).getPath();String code=path.substring(path.lastIndexOf('/')+1);
   token=audience.prepare(session,code,null,"browser-"+UUID.randomUUID()).token();var view=audience.join(session,token,code,"Ana",null,"Giz","Legião Urbana");
   otherToken=audience.prepare(session,code,null,"other-"+UUID.randomUUID()).token();audience.join(session,otherToken,code,"Bruno",null,"Outra música","Artist");
   call=stage.confirm(session,host,UUID.randomUUID(),view.participant().id(),view.requests().getFirst().id(),null,null).active().id();
   when(search.find("Giz","Legião Urbana")).thenReturn(new LyricsSearch.Result("FOUND","LRCLIB","Giz","Legião Urbana","Linha de teste um\nLinha de teste dois","https://lrclib.net/tracks/123"));
 }
 String path(){return "/api/participation/"+session+"/calls/"+call+"/lyrics";}
 @Test void lyricsRequireTheOwningParticipantAndAnAcceptedCall() throws Exception {
   mvc.perform(get(path())).andExpect(status().isUnauthorized());
   mvc.perform(get(path()).cookie(new Cookie("SF_PARTICIPANT",otherToken))).andExpect(status().isConflict());
   mvc.perform(get(path()).cookie(new Cookie("SF_PARTICIPANT",token))).andExpect(status().isForbidden());verifyNoInteractions(search);
   audience.respond(session,token,call,true);
   mvc.perform(get(path()).cookie(new Cookie("SF_PARTICIPANT",token))).andExpect(status().isOk()).andExpect(header().string("Cache-Control",org.hamcrest.Matchers.containsString("no-store"))).andExpect(jsonPath("$.status").value("FOUND")).andExpect(jsonPath("$.text").value("Linha de teste um\nLinha de teste dois"));
   verify(search).find("Giz","Legião Urbana");
 }
 @Test void finishedOrCancelledCallsNeverReturnLyrics() throws Exception {
   audience.respond(session,token,call,true);stage.resolve(session,host,call,"COMPLETED");
   mvc.perform(get(path()).cookie(new Cookie("SF_PARTICIPANT",token))).andExpect(status().isConflict());verifyNoInteractions(search);
 }
 @Test void rechecksAuthorizationAfterProviderReturnsWithoutHoldingDatabaseTransaction() throws Exception {
   audience.respond(session,token,call,true);
   when(search.find("Giz","Legião Urbana")).thenAnswer(invocation->{
     assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
     stage.resolve(session,host,call,"COMPLETED");
     return new LyricsSearch.Result("FOUND","LRCLIB","Giz","Legião Urbana","Texto de teste",null);
   });
   mvc.perform(get(path()).cookie(new Cookie("SF_PARTICIPANT",token))).andExpect(status().isConflict());
 }
 @Test void revokedParticipantAccessIsCheckedBeforeExternalLookup() throws Exception {
   audience.respond(session,token,call,true);
   stage.resolve(session,host,call,"COMPLETED");
   audience.leave(session,token);
   audience.forget(session,token);
   mvc.perform(get(path()).cookie(new Cookie("SF_PARTICIPANT",token))).andExpect(status().is4xxClientError());verifyNoInteractions(search);
 }
 @Test void closingCommittedSessionReleasesLyricsButRollbackKeepsThem(){
   cache.find(session,"Giz","Legião Urbana");stage.resolve(session,host,call,"COMPLETED");
   new org.springframework.transaction.support.TransactionTemplate(transactions).execute(status->{sessions.transition(session,host,"CLOSED");status.setRollbackOnly();return null;});
   cache.find(session,"Giz","Legião Urbana");verify(search).find("Giz","Legião Urbana");
   sessions.transition(session,host,"CLOSED");
   UUID next=UUID.randomUUID();fixtureSessions.add(next);sessions.create(host,"Nova",next);sessions.transition(next,host,"OPEN");cache.find(next,"Giz","Legião Urbana");verify(search,times(2)).find("Giz","Legião Urbana");
 }
 @Test void closingOneSessionPreservesLyricsUsedByAnotherOpenSession(){
   UUID other=UUID.randomUUID();fixtureSessions.add(other);sessions.create(host,"Outra",other);sessions.transition(other,host,"OPEN");
   cache.find(session,"Giz","Legião Urbana");cache.find(other,"Giz","Legião Urbana");stage.resolve(session,host,call,"COMPLETED");sessions.transition(session,host,"CLOSED");
   cache.find(other,"Giz","Legião Urbana");verify(search).find("Giz","Legião Urbana");
 }

}
