package br.tec.flowave.singflow.testsupport;

import org.testcontainers.utility.DockerImageName;
import org.testcontainers.utility.ImageNameSubstitutor;

/** CodeBuild-only hook. Local tests keep their existing registry unless explicitly enabled. */
public final class PublicRegistryImageSubstitutor extends ImageNameSubstitutor {
  @Override
  public DockerImageName apply(DockerImageName original) {
    String registry = original.getRegistry();
    if (!(registry.isEmpty() || registry.equals("docker.io")
        || registry.equals("registry.hub.docker.com") || registry.equals("index.docker.io"))) {
      return original;
    }
    // Explicit digest references must never be silently redirected to another repository.
    if (original.getVersionPart().startsWith("sha256:")) return original;
    String destination = switch (original.getRepository()) {
      case "postgres", "library/postgres" -> "public.ecr.aws/docker/library/postgres";
      case "testcontainers/ryuk" -> "ghcr.io/testcontainers/ryuk";
      default -> null;
    };
    if (destination == null) return original;
    return DockerImageName.parse(destination + ":" + original.getVersionPart())
        .asCompatibleSubstituteFor(original.asCompatibleSubstituteFor(
            destination.endsWith("/postgres") ? "postgres" : "testcontainers/ryuk"));
  }

  @Override
  protected String getDescription() {
    return "Official PostgreSQL from ECR Public and Testcontainers Ryuk from GHCR";
  }
}
