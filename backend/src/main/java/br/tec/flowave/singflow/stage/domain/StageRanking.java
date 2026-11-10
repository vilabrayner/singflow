package br.tec.flowave.singflow.stage.domain;

import java.util.*;

public final class StageRanking {
  private StageRanking() {}

  public record Candidate(
      UUID participantId,
      String name,
      String tableLabel,
      int completed,
      long arrivalOrder,
      UUID requestId,
      String title,
      String artist) {}

  public static List<Candidate> rank(List<Candidate> eligible, UUID lastCompleted) {
    return eligible.stream()
        .sorted(
            Comparator.comparingInt(Candidate::completed)
                .thenComparing(c -> c.participantId().equals(lastCompleted))
                .thenComparing(c -> c.requestId() == null)
                .thenComparingLong(Candidate::arrivalOrder)
                .thenComparing(Candidate::participantId))
        .toList();
  }
}
