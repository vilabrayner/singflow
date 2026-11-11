package br.tec.flowave.singflow.identity;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.web.server.ResponseStatusException;

class VerificationMailTests {
  @Test
  void confirmationUsesFrontendFragmentAndNeverMentionsAnApprovedAccount() {
    var sender = mock(JavaMailSender.class);
    var factory = new StaticListableBeanFactory();
    factory.addBean("sender", sender);
    var mail =
        new VerificationMail(
            factory.getBeanProvider(JavaMailSender.class),
            "SingFlow <access@example.test>",
            "https://app.example.test/");
    mail.send("guest@example.test", "dummy-token");
    var message = ArgumentCaptor.forClass(SimpleMailMessage.class);
    verify(sender).send(message.capture());
    assertThat(message.getValue().getText())
        .contains(
            "https://app.example.test/confirmar-email#token=dummy-token", "24 horas", "aprovação");
    assertThat(message.getValue().getTo()).containsExactly("guest@example.test");
  }

  @Test
  void missingProviderOrSenderDoesNotPretendToDeliver() {
    var factory = new StaticListableBeanFactory();
    var mail =
        new VerificationMail(
            factory.getBeanProvider(JavaMailSender.class), "", "https://app.example.test");
    assertThatThrownBy(mail::requireConfigured).isInstanceOf(ResponseStatusException.class);
  }
}
