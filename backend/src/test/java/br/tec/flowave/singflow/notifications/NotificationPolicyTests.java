package br.tec.flowave.singflow.notifications;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.net.http.*;
import java.security.*;
import java.security.spec.ECGenParameterSpec;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import tools.jackson.databind.ObjectMapper;

class NotificationPolicyTests {
  static MockEnvironment whatsapp(){return new MockEnvironment().withProperty("SINGFLOW_WHATSAPP_ENABLED","true")
    .withProperty("SINGFLOW_WHATSAPP_PHONE_NUMBER_ID","123456789")
    .withProperty("SINGFLOW_WHATSAPP_BUSINESS_PHONE","5581999999999")
    .withProperty("SINGFLOW_WHATSAPP_API_VERSION","v25.0")
    .withProperty("SINGFLOW_WHATSAPP_ACCESS_TOKEN","test-only-token")
    .withProperty("SINGFLOW_WHATSAPP_APP_SECRET","test-only-secret")
    .withProperty("SINGFLOW_WHATSAPP_VERIFY_TOKEN","test-only-verification")
    .withProperty("SINGFLOW_WHATSAPP_CALL_TEMPLATE","singflow_call");}
  static String[] keys()throws Exception{
    NotificationPolicy.crypto();var generator=KeyPairGenerator.getInstance("ECDH","BC");generator.initialize(new ECGenParameterSpec("prime256v1"));var pair=generator.generateKeyPair();
    var publicBytes=((org.bouncycastle.jce.interfaces.ECPublicKey)pair.getPublic()).getQ().getEncoded(false);
    var privateBytes=((org.bouncycastle.jce.interfaces.ECPrivateKey)pair.getPrivate()).getD().toByteArray();
    return new String[]{Base64.getUrlEncoder().withoutPadding().encodeToString(publicBytes),Base64.getUrlEncoder().withoutPadding().encodeToString(privateBytes)};
  }
  @Test void channelsAreDisabledByDefaultAndExplicitConfigurationIsRequired(){
    var config=new NotificationConfig(new MockEnvironment());assertThat(config.anyEnabled()).isFalse();
    assertThatThrownBy(()->new NotificationConfig(new MockEnvironment().withProperty("SINGFLOW_WHATSAPP_ENABLED","true"))).isInstanceOf(IllegalArgumentException.class);
    assertThat(new NotificationConfig(whatsapp()).whatsappEnabled).isTrue();
  }
  @Test void untrustedPushDestinationsAndInvalidKeysAreRejected(){
    for(String endpoint:List.of("http://fcm.googleapis.com/path","https://localhost/path","https://127.0.0.1/path","https://fcm.googleapis.com.evil.test/path","https://user:pass@fcm.googleapis.com/path","https://fcm.googleapis.com:444/path"))assertThatThrownBy(()->NotificationPolicy.endpoint(endpoint)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    assertThat(NotificationPolicy.endpoint("https://web.push.apple.com/example").getHost()).isEqualTo("web.push.apple.com");
    assertThatThrownBy(()->NotificationPolicy.subscription("https://fcm.googleapis.com/example","invalid","invalid")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
  }
  @Test void phoneIsNormalizedWithoutGuessingTheCountryAndCodesAreHashed(){
    assertThat(NotificationPolicy.phone("+55 (81) 99999-9999")).isEqualTo("+5581999999999");
    assertThatThrownBy(()->NotificationPolicy.phone("123")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    assertThat(NotificationPolicy.digest("one-time-code")).hasSize(64).doesNotContain("one-time-code");
  }
  @Test void ambiguousResponsesAreNotAutomaticallyRetried(){
    assertThat(NotificationTransport.classify(200,"provider-id").state()).isEqualTo("SENT");
    assertThat(NotificationTransport.classify(429,null).state()).isEqualTo("RETRY");
    assertThat(NotificationTransport.classify(503,null).state()).isEqualTo("UNKNOWN");
    assertThat(NotificationTransport.classify(410,null).code()).isEqualTo("GONE");
  }
  private NotificationOutbox.Delivery delivery(String channel,String key){return new NotificationOutbox.Delivery(UUID.randomUUID(),UUID.randomUUID(),channel,channel.equals("whatsapp")?"+5581999999999":"https://fcm.googleapis.com/test-only",key,Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[16]),UUID.randomUUID(),UUID.randomUUID(),"Ana","Karaokê","Giz — Legião Urbana",Instant.now().plusSeconds(120));}
  @Test void officialWhatsAppTransportUsesTheConfiguredTemplateWithoutRealNetwork()throws Exception{
    var http=mock(HttpClient.class);var response=mock(HttpResponse.class);when(response.statusCode()).thenReturn(200);when(response.body()).thenReturn("{\"messages\":[{\"id\":\"test-message\"}]}");
    doReturn(response).when(http).send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class));
    var result=new NotificationTransport(new NotificationConfig(whatsapp()),new ObjectMapper(),http).send(delivery("whatsapp",null));
    assertThat(result.state()).isEqualTo("SENT");assertThat(result.messageId()).isEqualTo("test-message");
    verify(http).send(argThat(request->request.uri().getHost().equals("graph.facebook.com")&&request.uri().getPath().equals("/v25.0/123456789/messages")&&request.method().equals("POST")),any(HttpResponse.BodyHandler.class));
  }
  @Test void webPushPayloadIsPreparedByTheProtocolLibraryAndUsesBoundedTtl()throws Exception{
    String[] keys=keys();var env=new MockEnvironment().withProperty("SINGFLOW_WEB_PUSH_ENABLED","true").withProperty("SINGFLOW_WEB_PUSH_PUBLIC_KEY",keys[0]).withProperty("SINGFLOW_WEB_PUSH_PRIVATE_KEY",keys[1]).withProperty("SINGFLOW_WEB_PUSH_SUBJECT","mailto:test@example.test");
    var http=mock(HttpClient.class);var response=mock(HttpResponse.class);when(response.statusCode()).thenReturn(201);
    doReturn(response).when(http).send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class));
    var result=new NotificationTransport(new NotificationConfig(env),new ObjectMapper(),http).send(delivery("webpush",keys[0]));
    assertThat(result.state()).isEqualTo("SENT");
    verify(http).send(argThat(request->request.headers().firstValue("TTL").orElse("").equals("60")&&request.headers().firstValue("Content-Encoding").orElse("").equals("aes128gcm")),any(HttpResponse.BodyHandler.class));
  }
}
