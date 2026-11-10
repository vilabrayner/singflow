package br.tec.flowave.singflow;

import static org.assertj.core.api.Assertions.*;

import java.nio.file.*;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.env.*;

class LocalEnvironmentTests {
  @TempDir Path root;

  private void project() throws Exception {
    Files.createDirectories(root.resolve("backend"));
    Files.writeString(root.resolve("backend/pom.xml"), "<project/>");
    Files.createDirectory(root.resolve("frontend"));
  }

  @Test
  void loadsSameFileFromRootAndBackendAndParsesQuotes() throws Exception {
    project();
    Files.writeString(
        root.resolve(".env"), "SINGFLOW_LOCAL_TEST_VALUE=\"a value with spaces # literal\"\n");
    var values = LocalEnvironment.load(root);
    assertThat(values.get("SINGFLOW_LOCAL_TEST_VALUE")).isEqualTo("a value with spaces # literal");
    assertThat(LocalEnvironment.load(root.resolve("backend"))).isEqualTo(values);
  }

  @Test
  void missingFileAllowsIdeConfiguration() throws Exception {
    project();
    assertThat(LocalEnvironment.load(root)).isEmpty();
  }

  @Test
  void refusesUnrelatedWorkingDirectory() {
    assertThatThrownBy(() -> LocalEnvironment.load(root)).isInstanceOf(IllegalStateException.class);
  }

  @Test
  void refusesFrontendAsWorkingDirectory() throws Exception {
    project();
    assertThatThrownBy(() -> LocalEnvironment.load(root.resolve("frontend")))
        .isInstanceOf(IllegalStateException.class);
  }

  @Test
  void parserErrorsDoNotExposeOffendingLines() throws Exception {
    project();
    Files.writeString(root.resolve(".env"), "private invalid text without equals");
    assertThatThrownBy(() -> LocalEnvironment.load(root))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageNotContaining("private invalid")
        .hasNoCause();
  }

  @Test
  void environmentAndJvmPropertiesWinOverDotenvAndDotenvWinsOverYaml() {
    var env = new StandardEnvironment();
    env.getPropertySources()
        .replace(
            StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME,
            new MapPropertySource(
                StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME,
                Map.of("SINGFLOW_LOCAL_TEST_ENV", "ide")));
    env.getPropertySources()
        .replace(
            StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME,
            new MapPropertySource(
                StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME,
                Map.of("SINGFLOW_LOCAL_TEST_JVM", "jvm")));
    env.getPropertySources()
        .addLast(new MapPropertySource("localYaml", Map.of("SINGFLOW_LOCAL_TEST_FILE", "yaml")));
    LocalEnvironment.apply(
        env,
        Map.of(
            "SINGFLOW_LOCAL_TEST_ENV",
            "file",
            "SINGFLOW_LOCAL_TEST_JVM",
            "file",
            "SINGFLOW_LOCAL_TEST_FILE",
            "file"));
    assertThat(env.getProperty("SINGFLOW_LOCAL_TEST_ENV")).isEqualTo("ide");
    assertThat(env.getProperty("SINGFLOW_LOCAL_TEST_JVM")).isEqualTo("jvm");
    assertThat(env.getProperty("SINGFLOW_LOCAL_TEST_FILE")).isEqualTo("file");
  }
}
