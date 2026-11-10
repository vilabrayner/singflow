package br.tec.flowave.singflow.stage.domain;

import static org.assertj.core.api.Assertions.*;

import br.tec.flowave.singflow.stage.domain.StageRanking.Candidate;
import java.util.*;
import org.junit.jupiter.api.Test;

class StageRankingTests {
  private Candidate candidate(int count, long arrival, boolean hasRequest) {
    return new Candidate(
        UUID.randomUUID(),
        "Pessoa",
        null,
        count,
        arrival,
        hasRequest ? UUID.randomUUID() : null,
        null,
        null);
  }

  @Test
  void fewerPerformancesWinsEvenWithoutRequestAndAfterJustSinging() {
    var a = candidate(0, 2, false);
    var b = candidate(1, 1, true);
    assertThat(StageRanking.rank(List.of(b, a), a.participantId())).containsExactly(a, b);
  }

  @Test
  void avoidsImmediateRepeatBeforeRequestTieBreaker() {
    var a = candidate(1, 1, true);
    var b = candidate(1, 2, false);
    assertThat(StageRanking.rank(List.of(a, b), a.participantId())).containsExactly(b, a);
  }

  @Test
  void requestsBreakTiesThenArrivalOrder() {
    var a = candidate(1, 1, false);
    var b = candidate(1, 3, true);
    var c = candidate(1, 2, true);
    assertThat(StageRanking.rank(List.of(a, b, c), null)).containsExactly(c, b, a);
  }

  @Test
  void suggestsSinglePersonAgainWithoutArtificialWait() {
    var a = candidate(1, 1, false);
    assertThat(StageRanking.rank(List.of(a), a.participantId())).containsExactly(a);
  }

  @Test
  void allWithoutRequestsFollowArrivalOrder() {
    var a = candidate(2, 2, false);
    var b = candidate(2, 1, false);
    assertThat(StageRanking.rank(List.of(a, b), null)).containsExactly(b, a);
  }
}
