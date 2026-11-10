package br.tec.flowave.singflow.participants.infrastructure;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ParticipantRepository extends JpaRepository<Participant, UUID> {
  List<Participant> findBySessionIdOrderByQueueOrderAsc(UUID sessionId);

  Optional<Participant> findByIdAndSessionId(UUID id, UUID sessionId);
}
