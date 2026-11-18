package br.tec.flowave.singflow.notifications;

import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
class NotificationConfig {
  final boolean whatsappEnabled,pushEnabled;
  final String phoneId,businessPhone,accessToken,apiVersion,appSecret,verifyToken,template,language;
  final String publicKey,privateKey,subject;
  NotificationConfig(Environment env){
    whatsappEnabled=env.getProperty("SINGFLOW_WHATSAPP_ENABLED",Boolean.class,false);
    pushEnabled=env.getProperty("SINGFLOW_WEB_PUSH_ENABLED",Boolean.class,false);
    phoneId=get(env,"SINGFLOW_WHATSAPP_PHONE_NUMBER_ID");businessPhone=get(env,"SINGFLOW_WHATSAPP_BUSINESS_PHONE");
    accessToken=get(env,"SINGFLOW_WHATSAPP_ACCESS_TOKEN");apiVersion=get(env,"SINGFLOW_WHATSAPP_API_VERSION");
    appSecret=get(env,"SINGFLOW_WHATSAPP_APP_SECRET");verifyToken=get(env,"SINGFLOW_WHATSAPP_VERIFY_TOKEN");
    template=get(env,"SINGFLOW_WHATSAPP_CALL_TEMPLATE");language=env.getProperty("SINGFLOW_WHATSAPP_TEMPLATE_LANGUAGE","pt_BR");
    publicKey=get(env,"SINGFLOW_WEB_PUSH_PUBLIC_KEY");privateKey=get(env,"SINGFLOW_WEB_PUSH_PRIVATE_KEY");subject=get(env,"SINGFLOW_WEB_PUSH_SUBJECT");
    if(whatsappEnabled && (!phoneId.matches("[0-9]{5,30}")||!businessPhone.matches("[1-9][0-9]{9,14}")||!apiVersion.matches("v[0-9]+\\.[0-9]+")||accessToken.isBlank()||appSecret.isBlank()||verifyToken.isBlank()||!template.matches("[a-z0-9_]{1,512}")))throw new IllegalArgumentException("Configure os parâmetros SINGFLOW_WHATSAPP_* antes de habilitar o canal.");
    if(pushEnabled&&(publicKey.isBlank()||privateKey.isBlank()||!(subject.startsWith("mailto:")||subject.startsWith("https://"))))throw new IllegalArgumentException("Configure as chaves e o contato SINGFLOW_WEB_PUSH_* antes de habilitar o canal.");
    if(pushEnabled){try{NotificationPolicy.crypto();new nl.martijndwars.webpush.PushService(publicKey,privateKey,subject);}catch(Exception e){throw new IllegalArgumentException("Chaves Web Push inválidas ou incompatíveis. Revise SINGFLOW_WEB_PUSH_*.");}}
  }
  private String get(Environment env,String key){return env.getProperty(key,"").trim();}
  boolean webhookReady(){return !appSecret.isBlank()&&!verifyToken.isBlank();}
  boolean anyEnabled(){return whatsappEnabled||pushEnabled;}
}
