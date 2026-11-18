package br.tec.flowave.singflow.audience;

import br.tec.flowave.singflow.identity.AccountLifecycle;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** A reusable personal account; participation arrival/order remain session-owned. */
@Service
public class AudienceAccounts {
  public record Profile(UUID id,String name,String email,String whatsappPhone,boolean whatsappEnabled,boolean pushEnabled,long version) {}
  public record LinkedSession(UUID id,String name,String status,String participantName) {}
  private final JdbcClient jdbc;
  private final AccountLifecycle accounts;
  public AudienceAccounts(JdbcClient jdbc,AccountLifecycle accounts){this.jdbc=jdbc;this.accounts=accounts;}
  public boolean active(String email){return email!=null&&accounts.find(email).filter(AccountLifecycle.Account::active).isPresent();}
  @Transactional
  public Profile profile(String email){
    var account=accounts.get(email);
    if(!account.active())throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Confirme seu e-mail para usar sua conta.");
    jdbc.sql("INSERT INTO singflow.participant_profiles(account_id) SELECT account_id FROM singflow.host_accounts WHERE email=? ON CONFLICT DO NOTHING").param(account.email()).update();
    return jdbc.sql("SELECT p.*,a.display_name,a.email FROM singflow.participant_profiles p JOIN singflow.host_accounts a USING(account_id) WHERE a.email=?")
      .param(account.email()).query((rs,n)->new Profile(rs.getObject("account_id",UUID.class),rs.getString("display_name"),rs.getString("email"),rs.getString("whatsapp_phone"),rs.getBoolean("whatsapp_enabled"),rs.getBoolean("push_enabled"),rs.getLong("version"))).single();
  }
  @Transactional
  public void link(String email,UUID session,UUID participant){
    var profile=profile(email);
    var bound=jdbc.sql("SELECT participant_id FROM singflow.participant_account_links WHERE session_id=? AND account_id=?").params(session,profile.id()).query(UUID.class).optional();
    if(bound.isPresent()&&!bound.get().equals(participant))throw new ResponseStatusException(HttpStatus.CONFLICT,"Sua conta já tem uma participação nesta sessão. Retome o acesso pelo seu perfil.");
    jdbc.sql("INSERT INTO singflow.participant_account_links(session_id,participant_id,account_id) VALUES(?,?,?) ON CONFLICT(session_id,participant_id) DO NOTHING").params(session,participant,profile.id()).update();
    var owner=jdbc.sql("SELECT account_id FROM singflow.participant_account_links WHERE session_id=? AND participant_id=?").params(session,participant).query(UUID.class).single();
    if(!owner.equals(profile.id()))throw new ResponseStatusException(HttpStatus.CONFLICT,"Esta participação já está vinculada a outra conta.");
  }
  @Transactional
  public Optional<UUID> linkedParticipant(String email,UUID session){
    var profile=profile(email);
    return jdbc.sql("SELECT participant_id FROM singflow.participant_account_links WHERE session_id=? AND account_id=?").params(session,profile.id()).query(UUID.class).optional();
  }
  @Transactional
  public UUID participant(String email,UUID session){
    var profile=profile(email);
    return jdbc.sql("SELECT participant_id FROM singflow.participant_account_links WHERE session_id=? AND account_id=?").params(session,profile.id()).query(UUID.class).optional()
      .orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Nenhuma participação vinculada nesta sessão."));
  }
  @Transactional
  public List<LinkedSession> sessions(String email){
    var profile=profile(email);
    return jdbc.sql("SELECT s.id,s.name,s.status,p.name AS participant_name FROM singflow.participant_account_links l JOIN singflow.sessions s ON s.id=l.session_id JOIN singflow.participants p ON p.id=l.participant_id WHERE l.account_id=? ORDER BY s.created_at DESC LIMIT 50")
      .param(profile.id()).query((rs,n)->new LinkedSession(rs.getObject("id",UUID.class),rs.getString("name"),rs.getString("status"),rs.getString("participant_name"))).list();
  }
}
