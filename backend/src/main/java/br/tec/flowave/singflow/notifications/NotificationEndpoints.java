package br.tec.flowave.singflow.notifications;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.security.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

@RestController
class NotificationEndpoints {
  record Preferences(boolean whatsapp,boolean push,@Min(0) long version) {}
  record Consent(boolean accepted) {}
  record Keys(@NotBlank @Size(max=128) String p256dh,@NotBlank @Size(max=64) String auth) {}
  record Subscription(@NotBlank @Size(max=4096) String endpoint,@NotNull @Valid Keys keys,boolean accepted) {}
  record Endpoint(@NotBlank @Size(max=4096) String endpoint) {}
  private final NotificationPreferences preferences;
  private final NotificationConfig config;
  private final ObjectMapper json;
  NotificationEndpoints(NotificationPreferences preferences,NotificationConfig config,ObjectMapper json){this.preferences=preferences;this.config=config;this.json=json;}
  @GetMapping("/api/participant-account/notifications/config") NotificationPreferences.Capabilities capabilities(){return preferences.capabilities();}
  @PostMapping("/api/participant-account/notifications/preferences") Object save(Principal actor,@Valid @RequestBody Preferences input){return preferences.preferences(actor.getName(),input.whatsapp(),input.push(),input.version());}
  @PostMapping("/api/participant-account/notifications/whatsapp") ResponseEntity<NotificationPreferences.WhatsAppLink> connect(Principal actor,@RequestBody Consent input){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(preferences.connect(actor.getName(),input.accepted()));}
  @PostMapping("/api/participant-account/notifications/push") Object subscribe(Principal actor,@Valid @RequestBody Subscription input){return preferences.subscribe(actor.getName(),input.endpoint(),input.keys().p256dh(),input.keys().auth(),input.accepted());}
  @PostMapping("/api/participant-account/notifications/push/remove") ResponseEntity<Void> unsubscribe(Principal actor,@Valid @RequestBody Endpoint input){preferences.unsubscribe(actor.getName(),input.endpoint());return ResponseEntity.noContent().build();}
  @GetMapping(value="/api/public/whatsapp/webhook",produces=MediaType.TEXT_PLAIN_VALUE)
  ResponseEntity<String> verify(@RequestParam("hub.mode") String mode,@RequestParam("hub.verify_token") String token,@RequestParam("hub.challenge") String challenge){
    if(!config.webhookReady()||!mode.equals("subscribe")||!MessageDigest.isEqual(token.getBytes(StandardCharsets.UTF_8),config.verifyToken.getBytes(StandardCharsets.UTF_8))||challenge.length()>256)throw new ResponseStatusException(HttpStatus.FORBIDDEN);
    return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(challenge);
  }
  @PostMapping("/api/public/whatsapp/webhook")
  ResponseEntity<Void> webhook(@RequestHeader(value="X-Hub-Signature-256",defaultValue="") String signature,@RequestBody byte[] body){
    if(!config.webhookReady()||body.length>262144||!signature.matches("sha256=[a-f0-9]{64}"))throw new ResponseStatusException(HttpStatus.FORBIDDEN);
    try{
      var mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(config.appSecret.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));
      if(!MessageDigest.isEqual(mac.doFinal(body),HexFormat.of().parseHex(signature.substring(7))))throw new ResponseStatusException(HttpStatus.FORBIDDEN);
      var root=json.readTree(body);
      for(var entry:root.path("entry"))for(var change:entry.path("changes")){
        var value=change.path("value");
        if(!config.phoneId.equals(value.path("metadata").path("phone_number_id").asText()))continue;
        for(var message:value.path("messages"))if(message.path("type").asText().equals("text")){
          try{preferences.inbound(message.path("from").asText(),message.path("text").path("body").asText());}
          catch(ResponseStatusException ignored){/* Acknowledged invalid/duplicate commands never transfer ownership. */}
        }
      }
    }catch(ResponseStatusException e){throw e;}
    catch(Exception e){throw NotificationPolicy.bad("Webhook inválido.");}
    return ResponseEntity.ok().cacheControl(CacheControl.noStore()).build();
  }
}
