package br.tec.flowave.singflow.notifications;

import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

@Service
class NotificationTransport {
  record Result(String state,String code,String messageId) {
    static Result skipped(){return new Result("SKIPPED","NO_LONGER_RELEVANT",null);}
  }
  private final NotificationConfig config;
  private final ObjectMapper json;
  private final HttpClient http;
  @org.springframework.beans.factory.annotation.Autowired
  NotificationTransport(NotificationConfig config,ObjectMapper json){this(config,json,HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4)).followRedirects(HttpClient.Redirect.NEVER).build());}
  NotificationTransport(NotificationConfig config,ObjectMapper json,HttpClient http){this.config=config;this.json=json;this.http=http;}
  Result send(NotificationOutbox.Delivery delivery){
    try{
      if(delivery.channel().equals("whatsapp")){
        if(!config.whatsappEnabled)return Result.skipped();
        var parameters=List.of(text(delivery.name()),text(delivery.eventName()),text(delivery.song()));
        var template=Map.of("name",config.template,"language",Map.of("code",config.language),"components",List.of(Map.of("type","body","parameters",parameters),Map.of("type","button","sub_type","url","index","0","parameters",List.of(text(delivery.session().toString())))));
        var payload=Map.of("messaging_product","whatsapp","to",delivery.destination().substring(1),"type","template","template",template);
        var request=HttpRequest.newBuilder(URI.create("https://graph.facebook.com/"+config.apiVersion+"/"+config.phoneId+"/messages")).timeout(Duration.ofSeconds(5)).header("Authorization","Bearer "+config.accessToken).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(payload))).build();
        var response=http.send(request,HttpResponse.BodyHandlers.ofString());
        String id=null;if(response.statusCode()/100==2){var node=json.readTree(response.body());id=node.path("messages").path(0).path("id").asText();if(id.isBlank())return new Result("UNKNOWN","INVALID_PROVIDER_RESPONSE",null);}
        return classify(response.statusCode(),id);
      }
      if(!config.pushEnabled)return Result.skipped();
      NotificationPolicy.endpoint(delivery.destination());NotificationPolicy.crypto();
      int ttl=(int)Math.max(0,Math.min(60,Duration.between(Instant.now(),delivery.expiresAt()).toSeconds()));
      if(ttl<=0)return Result.skipped();
      var payload=Map.of("title","É sua vez no karaokê!","body",delivery.song(),"session",delivery.session().toString(),"call",delivery.call().toString(),"expiresAt",delivery.expiresAt().toEpochMilli());
      var notification=nl.martijndwars.webpush.Notification.builder().endpoint(delivery.destination()).userPublicKey(delivery.key()).userAuth(delivery.auth()).payload(json.writeValueAsString(payload)).ttl(ttl).urgency(nl.martijndwars.webpush.Urgency.HIGH).topic(delivery.call().toString().replace("-","")).build();
      var service=new Encoder(config.publicKey,config.privateKey,config.subject);
      var encrypted=service.encode(notification);
      var builder=HttpRequest.newBuilder(NotificationPolicy.endpoint(encrypted.getUrl())).timeout(Duration.ofSeconds(5));
      encrypted.getHeaders().forEach(builder::header);
      var response=http.send(builder.POST(HttpRequest.BodyPublishers.ofByteArray(encrypted.getBody())).build(),HttpResponse.BodyHandlers.discarding());
      return classify(response.statusCode(),null);
    }catch(InterruptedException e){Thread.currentThread().interrupt();return new Result("UNKNOWN","INTERRUPTED",null);}
    catch(Exception e){return new Result("UNKNOWN","TRANSPORT_UNCERTAIN",null);}
  }
  private static final class Encoder extends nl.martijndwars.webpush.PushService {
    Encoder(String publicKey,String privateKey,String subject)throws java.security.GeneralSecurityException{super(publicKey,privateKey,subject);}
    nl.martijndwars.webpush.HttpRequest encode(nl.martijndwars.webpush.Notification notification)throws Exception{return prepareRequest(notification,nl.martijndwars.webpush.Encoding.AES128GCM);}
  }
  private Map<String,String> text(String value){return Map.of("type","text","text",value==null||value.isBlank()?"Participante":value);}
  static Result classify(int status,String id){
    if(status/100==2)return new Result("SENT","ACCEPTED",id);
    if(status==429)return new Result("RETRY","RATE_LIMITED",null);
    if(status==404||status==410)return new Result("FAILED","GONE",null);
    if(status>=500)return new Result("UNKNOWN","PROVIDER_UNCERTAIN",null);
    return new Result("FAILED","REJECTED_"+status,null);
  }
}
