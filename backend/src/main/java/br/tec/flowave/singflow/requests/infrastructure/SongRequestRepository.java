package br.tec.flowave.singflow.requests.infrastructure;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SongRequestRepository extends JpaRepository<SongRequest, UUID> {
  List<SongRequest> findBySessionIdOrderByRequestOrderAscCreatedAtAscIdAsc(UUID session);

  List<SongRequest> findBySessionIdAndParticipantIdAndStatus(
      UUID session, UUID participant, String status);
}
