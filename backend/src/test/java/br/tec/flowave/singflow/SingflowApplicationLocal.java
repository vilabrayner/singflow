package br.tec.flowave.singflow;

import java.nio.file.Path;
import org.springframework.boot.SpringApplication;

/** Local IDE entry point. Requires an already running PostgreSQL instance. */
public class SingflowApplicationLocal {

  public static void main(String[] args) {
    SpringApplication application = new SpringApplication(SingflowApplication.class);
    application.setAdditionalProfiles("local");
    var localValues = LocalEnvironment.load(Path.of(""));
    application.addInitializers(
        context -> LocalEnvironment.apply(context.getEnvironment(), localValues));
    application.run(args);
  }
}
