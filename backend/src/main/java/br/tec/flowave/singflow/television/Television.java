package br.tec.flowave.singflow.television;

import br.tec.flowave.singflow.audit.AuditTrail;
import br.tec.flowave.singflow.branding.BrandingRegistry;
import br.tec.flowave.singflow.audience.AudienceService;
import br.tec.flowave.singflow.sessions.SessionAccess;
import br.tec.flowave.singflow.stage.StageService;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class Television {
  public record Settings(boolean enabled,UUID venueId,UUID projectId,long version) {}
  public record View(UUID sessionId,String sessionName,String status,String venueName,String venueLogo,
      String brandLogo,String projectName,String backgroundUrl,String instagram,String entryUrl,StageService.TelevisionCue cue) {}
  private final BrandingRegistry branding;
  private final JdbcClient jdbc;
  private final SessionAccess sessions;
  private final StageService stage;
  private final AudienceService audience;
  private final AuditTrail audit;
  public Television(JdbcClient jdbc,SessionAccess sessions,StageService stage,AudienceService audience,AuditTrail audit,BrandingRegistry branding){
    this.branding=branding;
    this.jdbc=jdbc;this.sessions=sessions;this.stage=stage;this.audience=audience;this.audit=audit;
  }
  private Settings settings(UUID id){return jdbc.sql("SELECT * FROM singflow.session_tv_settings WHERE session_id=?")
    .param(id).query((rs,n)->new Settings(rs.getBoolean("enabled"),rs.getObject("venue_id",UUID.class),rs.getObject("project_id",UUID.class),rs.getLong("version")))
    .optional().orElse(new Settings(false,null,null,0));}
  @Transactional(readOnly=true)
  public Settings configuration(UUID id,String actor){sessions.requireOwned(id,actor);return settings(id);}
  @Transactional
  public Settings configure(UUID id,String actor,Settings input){
    sessions.lockOwned(id,actor,false);
    var session=sessions.requireOwned(id,actor);
    if(session.status().equals("CLOSED")&&input.enabled())throw new ResponseStatusException(HttpStatus.CONFLICT,"A sessão já foi encerrada.");
    var current=settings(id);
    if(current.version()!=input.version())throw new ResponseStatusException(HttpStatus.CONFLICT,"A configuração mudou. Abra novamente para revisar.");
    if(input.enabled()||input.venueId()!=null||input.projectId()!=null)branding.pair(input.venueId(),input.projectId());
    jdbc.sql("INSERT INTO singflow.session_tv_settings(session_id,enabled,venue_id,project_id,version) VALUES(?,?,?,?,1) ON CONFLICT(session_id) DO UPDATE SET enabled=excluded.enabled,venue_id=excluded.venue_id,project_id=excluded.project_id,version=singflow.session_tv_settings.version+1")
      .params(id,input.enabled(),input.venueId(),input.projectId()).update();
    if(input.enabled())audience.entryLink(id,actor,null);
    audit.record(actor,id,"TV_SETTINGS_UPDATED",id);
    return settings(id);
  }
  @Transactional(readOnly=true)
  public boolean available(UUID id){return jdbc.sql("SELECT EXISTS(SELECT 1 FROM singflow.session_tv_settings t JOIN singflow.sessions s ON s.id=t.session_id WHERE t.session_id=? AND t.enabled AND s.status<>'CLOSED')").param(id).query(Boolean.class).single();}
  @Transactional
  public View view(UUID id){
    var context=sessions.lockAudienceContext(id,false);
    var settings=settings(id);
    if(!settings.enabled())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"A TV não está disponível para esta sessão.");
    boolean open=context.session().status().equals("OPEN");
    var pair=branding.pair(settings.venueId(),settings.projectId());
    return new View(id,context.session().name(),context.session().status(),pair.venue().name(),pair.venue().logoUrl(),pair.project().logoUrl(),pair.project().name(),pair.venue().backgroundUrl(),
      pair.project().instagram(),open?audience.televisionEntry(id):null,open?stage.televisionCue(id,context.owner()):null);
  }
  @Transactional
  public SessionAccess.SessionView open(UUID id,String actor,boolean enabled,UUID venue,UUID project,long version){
    sessions.lockOwned(id,actor,false);
    configure(id,actor,new Settings(enabled,venue,project,version));
    return sessions.transition(id,actor,"OPEN");
  }
}
