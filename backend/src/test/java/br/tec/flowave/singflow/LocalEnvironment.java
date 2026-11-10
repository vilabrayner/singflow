package br.tec.flowave.singflow;

import io.github.cdimascio.dotenv.Dotenv;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;

/** Development-only configuration; never included in the production JAR. */
final class LocalEnvironment {
  private LocalEnvironment() {}

  static Map<String, Object> load(Path workingDirectory) {
    Path directory = workingDirectory.toAbsolutePath().normalize();
    Path root = isProjectRoot(directory) ? directory : directory.getParent();
    if (root == null
        || !isProjectRoot(root)
        || (!directory.equals(root) && !directory.equals(root.resolve("backend")))) {
      throw new IllegalStateException(
          "Execute o inicializador local com o diretorio de trabalho na raiz do SingFlow ou em"
              + " backend/.");
    }
    if (!Files.exists(root.resolve(".env"))) return Map.of();
    try {
      var dotenv = Dotenv.configure().directory(root.toString()).load();
      Map<String, Object> values = new HashMap<>();
      for (var entry : dotenv.entries(Dotenv.Filter.DECLARED_IN_ENV_FILE)) {
        values.put(entry.getKey(), entry.getValue());
      }
      return Map.copyOf(values);
    } catch (RuntimeException error) {
      // Parser exceptions may contain the offending line, including a password.
      throw new IllegalStateException(
          "Nao foi possivel ler o .env local. Confira o formato e as permissoes do arquivo; valores"
              + " nao serao exibidos.");
    }
  }

  static void apply(ConfigurableEnvironment environment, Map<String, Object> values) {
    environment
        .getPropertySources()
        .addAfter(
            StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME,
            new MapPropertySource("singflowLocalDotenv", values));
  }

  private static boolean isProjectRoot(Path directory) {
    return Files.isRegularFile(directory.resolve("backend/pom.xml"))
        && Files.isDirectory(directory.resolve("frontend"));
  }
}
