package br.tec.flowave.singflow.branding;

import br.tec.flowave.singflow.audit.AuditTrail;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class BrandingRegistry {
  public record Entry(UUID id,String kind,String name,UUID logoId,String logoUrl,UUID backgroundId,String backgroundUrl,String instagram,long version) {}
  public record Pair(Entry venue,Entry project) {}
  private final JdbcClient jdbc;private final AuditTrail audit;
  public BrandingRegistry(JdbcClient jdbc,AuditTrail audit){this.jdbc=jdbc;this.audit=audit;}
  public static String assetUrl(UUID id){return id==null?null:"/api/public/branding/assets/"+id;}
  @Transactional(readOnly=true)
  public List<Entry> list(){return jdbc.sql("SELECT * FROM singflow.branding_entities ORDER BY lower(name),id")
    .query((rs,n)->new Entry(rs.getObject("id",UUID.class),rs.getString("kind"),rs.getString("name"),rs.getObject("logo_id",UUID.class),assetUrl(rs.getObject("logo_id",UUID.class)),rs.getObject("background_id",UUID.class),assetUrl(rs.getObject("background_id",UUID.class)),rs.getString("instagram"),rs.getLong("version"))).list();}
  @Transactional(readOnly=true)
  public Pair pair(UUID venue,UUID project){
    var list=list();
    var v=list.stream().filter(e->e.id().equals(venue)&&e.kind().equals("VENUE")).findFirst().orElseThrow(()->bad("Escolha um local cadastrado."));
    var p=list.stream().filter(e->e.id().equals(project)&&e.kind().equals("PROJECT")).findFirst().orElseThrow(()->bad("Escolha um projeto de karaokê cadastrado."));
    return new Pair(v,p);
  }
  private void asset(UUID id){if(id!=null&&!jdbc.sql("SELECT EXISTS(SELECT 1 FROM singflow.branding_assets WHERE id=?)").param(id).query(Boolean.class).single())throw bad("Imagem não encontrada.");}
  @Transactional
  public Entry save(String actor,UUID id,String kind,String name,UUID logo,UUID background,String instagram,long version){
    if(id==null||!Set.of("VENUE","PROJECT").contains(kind)||name==null||name.isBlank()||name.strip().length()>120||version<0)throw bad("Confira os dados do cadastro.");
    if(kind.equals("PROJECT")&&background!=null)throw bad("O fundo pertence ao cadastro do local.");
    instagram=instagram==null?"":instagram.strip().replaceFirst("^@","");
    if(!instagram.matches("[A-Za-z0-9_.]{0,30}")||kind.equals("VENUE")&&!instagram.isEmpty())throw bad("Confira o Instagram do projeto.");
    asset(logo);asset(background);
    var existing=jdbc.sql("SELECT version FROM singflow.branding_entities WHERE id=? FOR UPDATE").param(id).query(Long.class).optional();
    if(existing.isEmpty()){
      if(version!=0)throw conflict();
      int inserted=jdbc.sql("INSERT INTO singflow.branding_entities(id,kind,name,logo_id,background_id,instagram) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING").params(id,kind,name.strip(),logo,background,instagram).update();
      if(inserted!=1)throw conflict();
    }else{
      if(existing.get()!=version)throw conflict();
      int changed=jdbc.sql("UPDATE singflow.branding_entities SET name=?,logo_id=?,background_id=?,instagram=?,version=version+1 WHERE id=? AND kind=? AND version=?")
        .params(name.strip(),logo,background,instagram,id,kind,version).update();
      if(changed!=1)throw conflict();
    }
    jdbc.sql("INSERT INTO singflow.branding_audit(id,entity_id,actor) VALUES(?,?,?)").params(UUID.randomUUID(),id,actor).update();
    for(UUID session:jdbc.sql("SELECT session_id FROM singflow.session_tv_settings WHERE venue_id=? OR project_id=?").params(id,id).query(UUID.class).list())audit.record(actor,session,"TV_BRANDING_UPDATED",id);
    return list().stream().filter(e->e.id().equals(id)).findFirst().orElseThrow();
  }
  private ResponseStatusException bad(String text){return new ResponseStatusException(HttpStatus.BAD_REQUEST,text);}
  private ResponseStatusException conflict(){return new ResponseStatusException(HttpStatus.CONFLICT,"O cadastro mudou. Abra novamente para revisar.");}
}
