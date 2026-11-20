package br.tec.flowave.singflow.catalog;

import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CifraResources {
  public record Link(UUID songId,String officialUrl,long version,String personalUrl,long personalVersion,String effectiveUrl,String source,List<String> alternatives) {}
  private final CatalogService catalog;
  private final JdbcClient jdbc;
  public CifraResources(CatalogService catalog,JdbcClient jdbc){this.catalog=catalog;this.jdbc=jdbc;}
  private Link map(java.sql.ResultSet rs,int n)throws java.sql.SQLException {
    String official=rs.getString("chords_url"),personal=rs.getString("url");
    List<String> alternatives=new ArrayList<>();
    try { // SQL exposes the alternatives as an array, never as executable content.
      var array=rs.getArray("alternatives");if(array!=null)for(Object value:(Object[])array.getArray())if(value instanceof String text&&!Objects.equals(text,personal)&&!alternatives.contains(text))alternatives.add(text);
    }catch(java.sql.SQLException e){throw e;}
    return new Link(rs.getObject("id",UUID.class),official,rs.getLong("version"),personal,rs.getLong("personal_version"),personal==null?official:personal,personal==null?"CATALOG":"PERSONAL",List.copyOf(alternatives));
  }
  private static final String SELECT="SELECT s.id,s.chords_url,s.version,p.url,coalesce(p.version,0) AS personal_version,ARRAY(SELECT jsonb_array_elements_text(coalesce(p.alternatives,'[]'::jsonb))) AS alternatives FROM singflow.catalog_songs s LEFT JOIN singflow.host_accounts a ON a.email=:actor AND singflow.has_account_role(a.email,'MUSICIAN') LEFT JOIN singflow.musician_chord_preferences p ON p.account_id=a.account_id AND p.song_id=s.id ";
  @Transactional(readOnly=true)
  public Link get(UUID song,String actor) {
    return jdbc.sql(SELECT+"WHERE s.id=:song AND s.deleted_at IS NULL AND s.status<>'MERGED'").param("actor",actor).param("song",song).query(this::map).optional().orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Música indisponível. Atualize a lista."));
  }
  @Transactional(readOnly=true)
  public Link admin(String actor,UUID song){catalog.admin(actor);return get(song,actor);}
  @Transactional(readOnly=true)
  public Map<UUID,Link> session(UUID session,String actor) {
    Map<UUID,Link> result=new LinkedHashMap<>();
    jdbc.sql(SELECT+"WHERE s.deleted_at IS NULL AND s.id IN (SELECT catalog_song_id FROM singflow.song_requests WHERE session_id=:session UNION SELECT catalog_song_id FROM singflow.stage_calls WHERE session_id=:session)").param("actor",actor).param("session",session).query(this::map).list().forEach(link->result.put(link.songId(),link));
    return result;
  }
  @Transactional
  public Link official(String actor,UUID song,long version,String input) {
    catalog.admin(actor);catalog.lock();String url=CifraSearch.safeUrl(input);var current=get(song,actor);
    if(current.version()!=version) {
      if(current.version()==version+1&&Objects.equals(url,current.officialUrl()))return current;
      throw conflict();
    }
    if(Objects.equals(url,current.officialUrl()))return current;
    String before=catalog.snapshot(song);
    jdbc.sql("UPDATE singflow.catalog_songs SET chords_url=?,version=version+1,updated_at=clock_timestamp() WHERE id=?").params(url,song).update();
    catalog.audit(song,actor,"CHORDS_LINKED","Referência de cifra definida pelo administrador.",before);
    return get(song,actor);
  }
  @Transactional
  public Link personal(String actor,UUID song,long version,String input) {
    catalog.lock();String url=CifraSearch.safeUrl(input);var current=get(song,actor);
    UUID account=jdbc.sql("SELECT account_id FROM singflow.host_accounts WHERE email=? AND singflow.has_account_role(email,'MUSICIAN') AND email_verified AND status='APPROVED'").param(actor).query(UUID.class).optional().orElseThrow(()->new ResponseStatusException(HttpStatus.FORBIDDEN));
    if(current.personalVersion()!=version) {
      if(current.personalVersion()==version+1&&Objects.equals(url,current.personalUrl())&&current.alternatives().isEmpty())return current;
      throw conflict();
    }
    if(Objects.equals(url,current.personalUrl())&&current.alternatives().isEmpty())return current;
    jdbc.sql("INSERT INTO singflow.musician_chord_audit(id,account_id,song_id,original_song_id,action,before_state,after_state) VALUES(?,?,?,?,'PREFERENCE_CHANGED',jsonb_build_object('url',cast(? AS text)),jsonb_build_object('url',cast(? AS text)))").params(UUID.randomUUID(),account,song,song,current.personalUrl(),url).update();
    jdbc.sql("INSERT INTO singflow.musician_chord_preferences(account_id,song_id,url,version) VALUES(?,?,?,1) ON CONFLICT(account_id,song_id) DO UPDATE SET url=excluded.url,version=musician_chord_preferences.version+1,alternatives='[]'::jsonb,updated_at=clock_timestamp()").params(account,song,url).update();
    return get(song,actor);
  }
  private ResponseStatusException conflict(){return new ResponseStatusException(HttpStatus.CONFLICT,"A referência de cifra mudou. Atualize antes de salvar.");}
}
