package br.tec.flowave.singflow.notifications;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

final class NotificationPolicy {
  private NotificationPolicy() {}
  static String digest(String value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
  static String phone(String input){String value=input==null?"":input.replaceAll("[^0-9]","");if(!value.matches("[1-9][0-9]{9,14}"))throw bad("Número de WhatsApp inválido.");return "+"+value;}
  static URI endpoint(String value){
    try{
      URI uri=URI.create(value);String host=Objects.toString(uri.getHost(),"").toLowerCase(Locale.ROOT);
      boolean provider=Set.of("fcm.googleapis.com","updates.push.services.mozilla.com","web.push.apple.com").contains(host)||host.endsWith(".push.services.mozilla.com")||host.endsWith(".push.apple.com")||host.endsWith(".notify.windows.com");
      if(!provider||!"https".equals(uri.getScheme())||uri.getPort()!=-1||uri.getUserInfo()!=null||uri.getFragment()!=null||value.length()>4096||uri.getRawPath()==null||uri.getRawPath().isBlank())throw bad("Serviço de notificações do navegador não suportado.");
      return uri;
    }catch(IllegalArgumentException e){throw bad("Assinatura de notificações inválida.");}
  }
  static void subscription(String endpoint,String key,String auth){
    endpoint(endpoint);crypto();
    try{
      if(Base64.getUrlDecoder().decode(key).length!=65||Base64.getUrlDecoder().decode(auth).length!=16)throw new IllegalArgumentException();
      new nl.martijndwars.webpush.Notification(endpoint,key,auth,new byte[0],60);
    }catch(Exception e){throw bad("Assinatura de notificações inválida.");}
  }
  static synchronized void crypto(){if(Security.getProvider("BC")==null)Security.addProvider(new BouncyCastleProvider());}
  static ResponseStatusException bad(String message){return new ResponseStatusException(HttpStatus.BAD_REQUEST,message);}
}
