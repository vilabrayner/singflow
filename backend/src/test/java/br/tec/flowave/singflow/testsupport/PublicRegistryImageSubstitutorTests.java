package br.tec.flowave.singflow.testsupport;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.testcontainers.utility.DockerImageName;

class PublicRegistryImageSubstitutorTests {
  private final PublicRegistryImageSubstitutor substitutor = new PublicRegistryImageSubstitutor();

  @Test
  void postgresKeepsItsVersionAndCompatibilityAcrossHubSpellings() {
    for (String name : new String[] {"postgres:17.6", "library/postgres:17.6",
        "docker.io/library/postgres:17.6", "registry.hub.docker.com/library/postgres:17.6"}) {
      var original = DockerImageName.parse(name);
      var result = substitutor.apply(original);
      assertThat(result.asCanonicalNameString()).isEqualTo("public.ecr.aws/docker/library/postgres:17.6");
      assertThat(result.isCompatibleWith(original)).isTrue();
      assertThat(result.isCompatibleWith(DockerImageName.parse("postgres"))).isTrue();
    }
  }

  @Test
  void ryukUsesThePublisherRegistryWithoutDisablingCleanup() {
    var original = DockerImageName.parse("testcontainers/ryuk:0.14.0");
    var result = substitutor.apply(original);
    assertThat(result.asCanonicalNameString()).isEqualTo("ghcr.io/testcontainers/ryuk:0.14.0");
    assertThat(result.isCompatibleWith(original)).isTrue();
  }

  @Test
  void unrelatedRegistriesImagesAndDigestPinsRemainUntouched() {
    for (String name : new String[] {"registry.example.test/postgres:17.6", "mysql:8.0",
        "public.ecr.aws/docker/library/postgres:17.6", "ghcr.io/testcontainers/ryuk:0.14.0",
        "postgres@sha256:" + "a".repeat(64)}) {
      var original = DockerImageName.parse(name);
      assertThat(substitutor.apply(original)).isSameAs(original);
    }
  }
}
