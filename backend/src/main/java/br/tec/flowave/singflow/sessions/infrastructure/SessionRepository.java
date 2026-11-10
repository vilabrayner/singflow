package br.tec.flowave.singflow.sessions.infrastructure;

import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.data.jpa.repository.*;

public interface SessionRepository extends JpaRepository<KaraokeSession, UUID> {
  List<KaraokeSession> findByOwnerOrderByCreatedAtDesc(String owner);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select s from KaraokeSession s where s.id = :id and s.owner = :owner")
  Optional<KaraokeSession> lockOwned(UUID id, String owner);

  Optional<KaraokeSession> findByIdAndOwner(UUID id, String owner);
}
