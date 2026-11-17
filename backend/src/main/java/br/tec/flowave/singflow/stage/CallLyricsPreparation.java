package br.tec.flowave.singflow.stage;

import br.tec.flowave.singflow.catalog.LyricsPrefetch;
import br.tec.flowave.singflow.catalog.LyricsSessionCache;
import br.tec.flowave.singflow.sessions.SessionClosing;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.*;

@Component
class CallLyricsPreparation {
  private final LyricsPrefetch lyrics;
  private final LyricsSessionCache cache;
  CallLyricsPreparation(LyricsPrefetch lyrics,LyricsSessionCache cache){this.lyrics=lyrics;this.cache=cache;}
  @TransactionalEventListener(phase=TransactionPhase.AFTER_COMMIT)
  void confirmed(CallConfirmed event){lyrics.prepare(event.sessionId(),event.title(),event.artist());}
  @TransactionalEventListener(phase=TransactionPhase.AFTER_COMMIT)
  void closed(SessionClosing event){cache.closeSession(event.sessionId());}
}
