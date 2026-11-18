package br.tec.flowave.singflow.television;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import br.tec.flowave.singflow.branding.BrandingRegistry;
import br.tec.flowave.singflow.sessions.SessionAccess;
import br.tec.flowave.singflow.audience.AudienceService;
import br.tec.flowave.singflow.stage.StageService;
import java.net.URI;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;

@Testcontainers
@AutoConfigureMockMvc
@SpringBootTest(properties={"SINGFLOW_HOST_EMAIL=","SINGFLOW_HOST_PASSWORD=","LASTFM_API_KEY=","SINGFLOW_ENRICHMENT_ENABLED=false","SINGFLOW_LYRICS_PREFETCH_ENABLED=false","SINGFLOW_CATALOG_SYNC_ENABLED=false","SINGFLOW_WHATSAPP_ENABLED=false","SINGFLOW_WEB_PUSH_ENABLED=false","SINGFLOW_NOTIFICATIONS_WORKER_ENABLED=false"})
class TelevisionIntegrationTests {
  @Container @ServiceConnection static PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:17.6");
  @Autowired MockMvc mvc; @Autowired JdbcClient jdbc; @Autowired SessionAccess sessions;
  @Autowired BrandingRegistry branding; @Autowired Television television; @Autowired AudienceService audience; @Autowired StageService stage;
  String host,other;UUID session;BrandingRegistry.Entry venue,project;
  @BeforeEach void setup(){
    host=account();other=account();session=UUID.randomUUID();sessions.create(host,"Quarta",session);
    venue=branding.save(host,UUID.randomUUID(),"VENUE","Café Tão",null,null,"",0);
    project=branding.save(host,UUID.randomUUID(),"PROJECT","Som Na Caixa",null,null,"karaoke.somnacaixa",0);
  }
  @Test void upgradesTheAlreadyAppliedV23WithoutRepairOrLosingLegacySettings()throws Exception{
    String database="tv_upgrade_"+UUID.randomUUID().toString().replace("-","");
    String url=postgres.getJdbcUrl().replace("/"+postgres.getDatabaseName(),"/"+database);
    try(var c=java.sql.DriverManager.getConnection(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword());var st=c.createStatement()){st.execute("CREATE DATABASE "+database);}
    try{
      var old=org.flywaydb.core.Flyway.configure().dataSource(url,postgres.getUsername(),postgres.getPassword()).target("23").load();old.migrate();
      try(var c=java.sql.DriverManager.getConnection(url,postgres.getUsername(),postgres.getPassword())){
        try(var st=c.createStatement();var result=st.executeQuery("SELECT checksum FROM public.flyway_schema_history WHERE version='23'")){assertThat(result.next()).isTrue();assertThat(result.getInt(1)).isEqualTo(712909785);}
        try(var st=c.createStatement()){
          st.execute("INSERT INTO singflow.host_accounts(email,password_hash,role) VALUES('legacy-tv@example.test','unused','HOST')");
          st.execute("INSERT INTO singflow.sessions(id,owner,name,status,created_at) VALUES('11111111-1111-4111-8111-111111111111','legacy-tv@example.test','Ensaio preservado','DRAFT',clock_timestamp())");
          st.execute("INSERT INTO singflow.session_tv_settings(session_id,enabled,venue_name,venue_logo,brand_logo) VALUES('11111111-1111-4111-8111-111111111111',true,'Café Tão','/brand/local.png','/brand/projeto.png')");
        }
      }
      var upgraded=org.flywaydb.core.Flyway.configure().dataSource(url,postgres.getUsername(),postgres.getPassword()).load();upgraded.migrate();assertThat(upgraded.validateWithResult().validationSuccessful).isTrue();
      try(var c=java.sql.DriverManager.getConnection(url,postgres.getUsername(),postgres.getPassword());var st=c.createStatement();var row=st.executeQuery("SELECT t.*,s.name AS session_name FROM singflow.session_tv_settings t JOIN singflow.sessions s ON s.id=t.session_id")){
        assertThat(row.next()).isTrue();assertThat(row.getBoolean("enabled")).isFalse();assertThat(row.getString("venue_name")).isEqualTo("Café Tão");assertThat(row.getString("venue_logo")).isEqualTo("/brand/local.png");assertThat(row.getString("brand_logo")).isEqualTo("/brand/projeto.png");assertThat(row.getString("session_name")).isEqualTo("Ensaio preservado");assertThat(row.getObject("venue_id")).isNull();
      }
    }finally{try(var c=java.sql.DriverManager.getConnection(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword());var st=c.createStatement()){st.execute("DROP DATABASE "+database+" WITH (FORCE)");}}
  }

  String account(){String email=UUID.randomUUID()+"@example.test";jdbc.sql("INSERT INTO singflow.host_accounts(email,password_hash,role) VALUES(?,'unused','HOST')").param(email).update();return email;}
  Television.Settings enable(UUID id,String actor){return television.configure(id,actor,new Television.Settings(true,venue.id(),project.id(),0));}
  String openBody(){return "{\"enabled\":true,\"venueId\":\""+venue.id()+"\",\"projectId\":\""+project.id()+"\",\"version\":0}";}
  @Test void settingsAreOwnedAndExplicitAndDraftsExposeNoQueueOrEntry()throws Exception{
    mvc.perform(get("/api/public/tv/"+session)).andExpect(status().isNotFound());
    mvc.perform(get("/api/sessions/"+session+"/tv").with(user(other).roles("HOST"))).andExpect(status().isNotFound());
    mvc.perform(post("/api/sessions/"+session+"/tv").with(user(host).roles("HOST")).contentType("application/json").content(openBody())).andExpect(status().isForbidden());
    var settings=enable(session,host);
    mvc.perform(get("/api/public/tv/"+session)).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
      .andExpect(jsonPath("$.status").value("DRAFT")).andExpect(jsonPath("$.venueName").value("Café Tão"))
      .andExpect(jsonPath("$.projectName").value("Som Na Caixa")).andExpect(jsonPath("$.entryUrl").doesNotExist()).andExpect(jsonPath("$.cue").doesNotExist());
    television.configure(session,host,new Television.Settings(false,venue.id(),project.id(),settings.version()));
    assertThat(television.available(session)).isFalse();
    mvc.perform(get("/api/public/tv/"+session)).andExpect(status().isNotFound());
  }
  @Test void twoHostsMayChooseTheSameProjectButTheirTvDataNeverMixes()throws Exception{
    television.open(session,host,true,venue.id(),project.id(),0);
    UUID second=UUID.randomUUID();sessions.create(other,"Particular",second);television.open(second,other,true,venue.id(),project.id(),0);
    var ana=join(session,host,"Ana","Giz");var bruno=join(second,other,"Bruno","Será");
    var first=television.view(session);var last=television.view(second);
    assertThat(first.entryUrl()).contains(session.toString()).doesNotContain(second.toString());
    assertThat(first.cue().name()).isEqualTo("Ana");assertThat(last.cue().name()).isEqualTo("Bruno");
    stage.confirm(session,host,UUID.randomUUID(),ana.participant().id(),ana.requests().getFirst().id(),null,null);
    assertThat(television.view(session).cue().called()).isTrue();assertThat(television.view(second).cue().called()).isFalse();
    var response=mvc.perform(get("/api/public/tv/"+session)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    assertThat(response).contains("Ana","Giz").doesNotContain("Bruno",other,host,"whatsapp","tableLabel","participantId","requests","history");
  }
  AudienceService.OwnView join(UUID id,String actor,String name,String song){
    var path=URI.create(audience.entryLink(id,actor,null).url()).getPath();String code=path.substring(path.lastIndexOf('/')+1);
    String token=audience.prepare(id,code,null,"tv-test-"+UUID.randomUUID()).token();
    return audience.join(id,token,code,name,"Mesa privada",song,"Artista");
  }
  @Test void openingValidatesSelectionAndIsAtomicAndClosedTvHasNoPersonalData()throws Exception{
    mvc.perform(post("/api/sessions/"+session+"/presentation/open").with(user(host).roles("HOST")).with(csrf()).contentType("application/json").content("{\"enabled\":true,\"venueId\":\""+project.id()+"\",\"projectId\":\""+venue.id()+"\",\"version\":0}")).andExpect(status().isBadRequest());
    assertThat(sessions.requireOwned(session,host).status()).isEqualTo("DRAFT");
    assertThat(television.configuration(session,host).version()).isZero();
    mvc.perform(post("/api/sessions/"+session+"/presentation/open").with(user(host).roles("HOST")).with(csrf()).contentType("application/json").content(openBody())).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("OPEN"));
    sessions.transition(session,host,"CLOSED");
    var closed=television.view(session);assertThat(closed.status()).isEqualTo("CLOSED");assertThat(closed.cue()).isNull();assertThat(closed.entryUrl()).isNull();assertThat(television.available(session)).isFalse();
  }
  @Test void brandingRequiresAdminAndEditsAreVersionedAuditedAndVisibleOnTheTv()throws Exception{
    String body="{\"id\":\""+venue.id()+"\",\"kind\":\"VENUE\",\"name\":\"Novo local\",\"version\":1}";
    mvc.perform(post("/api/admin/branding").with(user(host).roles("HOST")).with(csrf()).contentType("application/json").content(body)).andExpect(status().isForbidden());
    jdbc.sql("UPDATE singflow.host_accounts SET administrator=true WHERE email=?").param(host).update();
    enable(session,host);
    mvc.perform(post("/api/admin/branding").with(user(host).roles("ADMIN","HOST")).with(csrf()).contentType("application/json").content(body)).andExpect(status().isOk());
    assertThat(television.view(session).venueName()).isEqualTo("Novo local");
    mvc.perform(post("/api/admin/branding").with(user(host).roles("ADMIN","HOST")).with(csrf()).contentType("application/json").content(body)).andExpect(status().isConflict());
    assertThat(jdbc.sql("SELECT count(*) FROM singflow.branding_audit WHERE entity_id=?").param(venue.id()).query(Long.class).single()).isEqualTo(2);
    assertThatThrownBy(()->branding.save(host,UUID.randomUUID(),"PROJECT","Inválido",null,UUID.randomUUID(),"",0)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
  }
}
