package br.tec.flowave.singflow.identity;

import java.net.URI;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class VerificationMail {
  private final ObjectProvider<JavaMailSender> sender;
  private final String from;
  private final String appUrl;

  public VerificationMail(
      ObjectProvider<JavaMailSender> sender,
      @Value("${SINGFLOW_MAIL_FROM:}") String from,
      @Value("${SINGFLOW_PUBLIC_APP_URL:http://127.0.0.1:4200}") String appUrl) {
    this.sender = sender;
    this.from = from;
    this.appUrl = appUrl.replaceAll("/+$", "");
  }

  public void requireConfigured() {
    if (sender.getIfAvailable() == null || from.isBlank()) throw unavailable();
  }

  public void send(String email, String token) {
    requireConfigured();
    var origin = URI.create(appUrl);
    if (origin.getHost() == null
        || !(origin.getScheme().equals("https") || origin.getScheme().equals("http")))
      throw unavailable();
    var message = new SimpleMailMessage();
    message.setFrom(from);
    message.setTo(email);
    message.setSubject("Confirme seu e-mail · SingFlow");
    message.setText(
        "Confirme seu e-mail no SingFlow:\n\n"
            + appUrl
            + "/confirmar-email#token="
            + token
            + "\n\n"
            + "O link vale por 24 horas e pode ser usado uma vez. Depois da confirmação, seu"
            + " cadastro aguarda aprovação do administrador. Se você não solicitou este cadastro,"
            + " ignore a mensagem.");
    try {
      sender.getObject().send(message);
    } catch (org.springframework.mail.MailException exception) {
      throw unavailable();
    }
  }

  private ResponseStatusException unavailable() {
    return new ResponseStatusException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "O envio de e-mail está indisponível. Tente novamente mais tarde.");
  }
}
