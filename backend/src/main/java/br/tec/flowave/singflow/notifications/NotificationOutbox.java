package br.tec.flowave.singflow.notifications;

import br.tec.flowave.singflow.stage.CallConfirmed;
import java.time.Instant;
import java.util.*;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

/** Persist intent atomically with the call; provider I/O is always outside this transaction. */
@Service
class NotificationOutbox {
  record Claim(UUID id,UUID token) {}
  record Delivery(UUID id,UUID accountId,String channel,String destination,String key,String auth,
                  UUID session,UUID call,String name,String eventName,String song,Instant expiresAt) {}
  private final JdbcClient jdbc;
  private final NotificationConfig config;
  NotificationOutbox(JdbcClient jdbc,NotificationConfig config){this.jdbc=jdbc;this.config=config;}
  @EventListener
  @Transactional(propagation=Propagation.MANDATORY)
  public void called(CallConfirmed event){
    if(!config.anyEnabled())return;
    if(config.whatsappEnabled)enqueue(event,"whatsapp","p.account_id","p.whatsapp_enabled AND p.whatsapp_phone IS NOT NULL","");
    if(config.pushEnabled)enqueue(event,"webpush","w.id","p.push_enabled AND w.active","JOIN singflow.web_push_subscriptions w ON w.account_id=p.account_id");
  }
  private void enqueue(CallConfirmed event,String channel,String destination,String condition,String extraJoin){
    jdbc.sql("""
      INSERT INTO singflow.participant_notification_jobs(id,session_id,call_id,account_id,channel,destination_id,profile_version,expires_at)
      SELECT gen_random_uuid(),c.session_id,c.id,p.account_id,?,%s,p.version,clock_timestamp()+interval '2 minutes'
      FROM singflow.stage_calls c
      JOIN singflow.participant_account_links l ON l.session_id=c.session_id AND l.participant_id=c.participant_id
      JOIN singflow.participant_profiles p ON p.account_id=l.account_id
      %s
      WHERE c.id=? AND c.session_id=? AND c.status='CALLED' AND c.accepted_at IS NULL AND %s
      ON CONFLICT(call_id,channel,destination_id) DO NOTHING
      """.formatted(destination,extraJoin,condition)).params(channel,event.callId(),event.sessionId()).update();
  }
  @Transactional
  public Optional<Claim> claim(){
    // A process may have died after provider acceptance. Never resend an ambiguous delivery.
    jdbc.sql("UPDATE singflow.participant_notification_jobs SET state='UNKNOWN',last_error='INTERRUPTED',claim_id=NULL WHERE state='PROCESSING' AND lease_until<clock_timestamp()").update();
    jdbc.sql("UPDATE singflow.participant_notification_jobs SET state='SKIPPED',last_error='EXPIRED' WHERE state='PENDING' AND expires_at<=clock_timestamp()").update();
    var next=jdbc.sql("SELECT id FROM singflow.participant_notification_jobs WHERE state='PENDING' AND available_at<=clock_timestamp() AND expires_at>clock_timestamp() ORDER BY available_at,id LIMIT 1 FOR UPDATE SKIP LOCKED").query(UUID.class).optional();
    if(next.isEmpty())return Optional.empty();UUID token=UUID.randomUUID();
    jdbc.sql("UPDATE singflow.participant_notification_jobs SET state='PROCESSING',claim_id=?,attempts=attempts+1,lease_until=clock_timestamp()+interval '30 seconds' WHERE id=?").params(token,next.get()).update();
    return Optional.of(new Claim(next.get(),token));
  }
  @Transactional(readOnly=true)
  public Optional<Delivery> delivery(Claim claim){
    return jdbc.sql("""
      SELECT j.id,j.account_id,j.channel,j.session_id,j.call_id,j.expires_at,p.whatsapp_phone,
        w.endpoint,w.p256dh,w.auth,a.display_name,s.name AS event_name,
        coalesce(m.title,'Combine a música com o anfitrião') AS song_title,coalesce(m.artist,'') AS song_artist
      FROM singflow.participant_notification_jobs j
      JOIN singflow.participant_profiles p ON p.account_id=j.account_id AND p.version=j.profile_version
      JOIN singflow.host_accounts a ON a.account_id=p.account_id AND a.email_verified AND a.status='APPROVED'
      JOIN singflow.sessions s ON s.id=j.session_id AND s.status='OPEN'
      JOIN singflow.stage_calls c ON c.id=j.call_id AND c.session_id=j.session_id AND c.status='CALLED' AND c.accepted_at IS NULL
      JOIN singflow.participants v ON v.id=c.participant_id AND v.status='ACTIVE'
      JOIN singflow.participant_account_links l ON l.session_id=c.session_id AND l.participant_id=c.participant_id AND l.account_id=p.account_id
      LEFT JOIN singflow.catalog_songs m ON m.id=c.catalog_song_id
      LEFT JOIN singflow.web_push_subscriptions w ON w.id=j.destination_id AND w.account_id=j.account_id
      WHERE j.id=? AND j.claim_id=? AND j.state='PROCESSING' AND j.expires_at>clock_timestamp()
        AND ((j.channel='whatsapp' AND p.whatsapp_enabled AND p.whatsapp_phone IS NOT NULL)
          OR (j.channel='webpush' AND p.push_enabled AND w.active))
      """).params(claim.id(),claim.token()).query((rs,n)->new Delivery(rs.getObject("id",UUID.class),rs.getObject("account_id",UUID.class),rs.getString("channel"),rs.getString("channel").equals("whatsapp")?rs.getString("whatsapp_phone"):rs.getString("endpoint"),rs.getString("p256dh"),rs.getString("auth"),rs.getObject("session_id",UUID.class),rs.getObject("call_id",UUID.class),rs.getString("display_name"),rs.getString("event_name"),rs.getString("song_title")+(rs.getString("song_artist").isBlank()?"":" — "+rs.getString("song_artist")),rs.getTimestamp("expires_at").toInstant())).optional();
  }
  @Transactional
  public void finish(Claim claim,NotificationTransport.Result result){
    String state=result.state();
    if(state.equals("RETRY")){
      jdbc.sql("UPDATE singflow.participant_notification_jobs SET state=CASE WHEN attempts<3 AND expires_at>clock_timestamp()+interval '5 seconds' THEN 'PENDING' ELSE 'FAILED' END,available_at=clock_timestamp()+interval '5 seconds',claim_id=NULL,last_error=? WHERE id=? AND claim_id=? AND state='PROCESSING'").params(result.code(),claim.id(),claim.token()).update();return;
    }
    jdbc.sql("UPDATE singflow.participant_notification_jobs SET state=?,provider_message_id=?,last_error=?,claim_id=NULL WHERE id=? AND claim_id=? AND state='PROCESSING'").params(state,result.messageId(),result.code(),claim.id(),claim.token()).update();
    if(result.code().equals("GONE"))jdbc.sql("UPDATE singflow.web_push_subscriptions SET active=false WHERE id=(SELECT destination_id FROM singflow.participant_notification_jobs WHERE id=? AND channel='webpush')").param(claim.id()).update();
  }
}
