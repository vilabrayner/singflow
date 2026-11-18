package br.tec.flowave.singflow.notifications;

import br.tec.flowave.singflow.audience.AudienceAccounts;
import java.security.*;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
class NotificationPreferences {
  record Capabilities(boolean whatsappAvailable,boolean pushAvailable,String vapidPublicKey) {}
  record WhatsAppLink(String url,Instant expiresAt) {}
  record Subscription(UUID id) {}
  private final AudienceAccounts accounts;
  private final JdbcClient jdbc;
  private final NotificationConfig config;
  NotificationPreferences(AudienceAccounts accounts,JdbcClient jdbc,NotificationConfig config){this.accounts=accounts;this.jdbc=jdbc;this.config=config;}
  Capabilities capabilities(){return new Capabilities(config.whatsappEnabled,config.pushEnabled,config.pushEnabled?config.publicKey:"");}
  private void consent(UUID account,String channel,boolean enabled,String source){jdbc.sql("INSERT INTO singflow.participant_notification_consent(id,account_id,channel,enabled,source) VALUES(?,?,?,?,?)").params(UUID.randomUUID(),account,channel,enabled,source).update();}
  @Transactional
  AudienceAccounts.Profile preferences(String email,boolean whatsapp,boolean push,long version){
    var profile=accounts.profile(email);
    if(whatsapp&&(!config.whatsappEnabled||profile.whatsappPhone()==null))throw NotificationPolicy.bad("Conecte e confirme seu WhatsApp antes de ativar os avisos.");
    if(push&&(!config.pushEnabled||!jdbc.sql("SELECT EXISTS(SELECT 1 FROM singflow.web_push_subscriptions WHERE account_id=? AND active)").param(profile.id()).query(Boolean.class).single()))throw NotificationPolicy.bad("Ative as notificações neste aparelho primeiro.");
    int changed=jdbc.sql("UPDATE singflow.participant_profiles SET whatsapp_enabled=?,push_enabled=?,version=version+1 WHERE account_id=? AND version=?").params(whatsapp,push,profile.id(),version).update();
    if(changed!=1)throw new ResponseStatusException(HttpStatus.CONFLICT,"As preferências mudaram. Atualize e tente novamente.");
    if(profile.whatsappEnabled()!=whatsapp)consent(profile.id(),"whatsapp",whatsapp,"PROFILE");
    if(profile.pushEnabled()!=push)consent(profile.id(),"webpush",push,"PROFILE");
    return accounts.profile(email);
  }
  @Transactional
  WhatsAppLink connect(String email,boolean accepted){
    if(!config.whatsappEnabled)throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"WhatsApp ainda não configurado.");
    if(!accepted)throw NotificationPolicy.bad("Autorize os avisos da sua convocação para conectar o WhatsApp.");
    var profile=accounts.profile(email);byte[] bytes=new byte[32];new SecureRandom().nextBytes(bytes);String code=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    var expiry=Instant.now().plusSeconds(600);
    jdbc.sql("INSERT INTO singflow.whatsapp_link_codes(account_id,code_hash,expires_at) VALUES(?,?,?) ON CONFLICT(account_id) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at")
      .params(profile.id(),NotificationPolicy.digest(code),java.sql.Timestamp.from(expiry)).update();
    return new WhatsAppLink("https://wa.me/"+config.businessPhone+"?text="+java.net.URLEncoder.encode("SINGFLOW "+code,java.nio.charset.StandardCharsets.UTF_8),expiry);
  }
  @Transactional
  void inbound(String from,String text){
    String phone=NotificationPolicy.phone(from);
    jdbc.sql("SELECT pg_advisory_xact_lock(hashtextextended(?,0))").param("notification-phone:"+phone).query((rs,n)->true).single();
    if(Set.of("SAIR","PARAR").contains(text.strip().toUpperCase(Locale.ROOT))){
      jdbc.sql("SELECT account_id FROM singflow.participant_profiles WHERE whatsapp_phone=? AND whatsapp_enabled FOR UPDATE").param(phone).query(UUID.class).optional().ifPresent(id->{jdbc.sql("UPDATE singflow.participant_profiles SET whatsapp_enabled=false,version=version+1 WHERE account_id=?").param(id).update();consent(id,"whatsapp",false,"WHATSAPP_OPT_OUT");});return;
    }
    if(!text.matches("SINGFLOW [A-Za-z0-9_-]{43}"))return;
    var id=jdbc.sql("DELETE FROM singflow.whatsapp_link_codes c USING singflow.host_accounts a WHERE c.account_id=a.account_id AND a.email_verified AND a.status='APPROVED' AND c.code_hash=? AND c.expires_at>now() RETURNING c.account_id").param(NotificationPolicy.digest(text.substring(9))).query(UUID.class).optional();
    if(id.isEmpty())return;
    boolean other=jdbc.sql("SELECT EXISTS(SELECT 1 FROM singflow.participant_profiles WHERE whatsapp_phone=? AND account_id<>?)").params(phone,id.get()).query(Boolean.class).single();
    if(other)throw new ResponseStatusException(HttpStatus.CONFLICT,"Número já vinculado a outra conta.");
    jdbc.sql("UPDATE singflow.participant_profiles SET whatsapp_phone=?,whatsapp_enabled=true,version=version+1 WHERE account_id=?").params(phone,id.get()).update();
    consent(id.get(),"whatsapp",true,"WHATSAPP_VERIFIED");
  }
  @Transactional
  Subscription subscribe(String email,String endpoint,String key,String auth,boolean accepted){
    if(!config.pushEnabled)throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Notificações do navegador ainda não configuradas.");
    if(!accepted)throw NotificationPolicy.bad("Autorize os avisos neste aparelho.");
    NotificationPolicy.subscription(endpoint,key,auth);var profile=accounts.profile(email);
    String hash=NotificationPolicy.digest(endpoint);
    jdbc.sql("SELECT pg_advisory_xact_lock(hashtextextended(?,0))").param("notification-endpoint:"+hash).query((rs,n)->true).single();
    jdbc.sql("SELECT account_id FROM singflow.participant_profiles WHERE account_id=? FOR UPDATE").param(profile.id()).query(UUID.class).single();
    var existing=jdbc.sql("SELECT account_id FROM singflow.web_push_subscriptions WHERE endpoint_hash=? FOR UPDATE").param(hash).query(UUID.class).optional();
    if(existing.isPresent()&&!existing.get().equals(profile.id()))throw new ResponseStatusException(HttpStatus.CONFLICT,"A assinatura deste aparelho pertence a outra conta. Desative-a antes de continuar.");
    if(existing.isEmpty()&&jdbc.sql("SELECT count(*) FROM singflow.web_push_subscriptions WHERE account_id=? AND active").param(profile.id()).query(Integer.class).single()>=8)throw new ResponseStatusException(HttpStatus.CONFLICT,"Desative um aparelho antes de adicionar outro.");
    UUID id=UUID.randomUUID();
    id=jdbc.sql("INSERT INTO singflow.web_push_subscriptions(id,account_id,endpoint,endpoint_hash,p256dh,auth) VALUES(?,?,?,?,?,?) ON CONFLICT(endpoint_hash) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,active=true RETURNING id")
      .params(id,profile.id(),endpoint,hash,key,auth).query(UUID.class).single();
    jdbc.sql("UPDATE singflow.participant_profiles SET push_enabled=true,version=version+1 WHERE account_id=?").param(profile.id()).update();
    consent(profile.id(),"webpush",true,"BROWSER_SUBSCRIPTION");return new Subscription(id);
  }
  @Transactional
  void unsubscribe(String email,String endpoint){
    var profile=accounts.profile(email);
    jdbc.sql("UPDATE singflow.web_push_subscriptions SET active=false WHERE account_id=? AND endpoint_hash=?").params(profile.id(),NotificationPolicy.digest(endpoint)).update();
    // Revalidate queued deliveries even when other devices remain subscribed.
    jdbc.sql("UPDATE singflow.participant_profiles SET version=version+1 WHERE account_id=?").param(profile.id()).update();
    consent(profile.id(),"webpush",false,"BROWSER_UNSUBSCRIPTION");
  }
}
