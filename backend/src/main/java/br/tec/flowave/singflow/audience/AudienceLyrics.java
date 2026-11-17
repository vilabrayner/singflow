package br.tec.flowave.singflow.audience;

import br.tec.flowave.singflow.catalog.LyricsSearch;
import br.tec.flowave.singflow.catalog.LyricsSessionCache;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AudienceLyrics {
  private final AudienceService audience;
  private final LyricsSessionCache search;
  public AudienceLyrics(AudienceService audience,LyricsSessionCache search){this.audience=audience;this.search=search;}
  private AudienceService.OwnView context(UUID session,String token,UUID call){
    var view=audience.me(session,token);
    if(!view.session().status().equals("OPEN")||view.active()==null||!view.active().id().equals(call))
      throw new ResponseStatusException(HttpStatus.CONFLICT,"A apresentação foi alterada. Atualize o painel.");
    if(view.active().acceptedAt()==null)throw new ResponseStatusException(HttpStatus.FORBIDDEN,"A letra fica disponível após confirmar sua ida ao palco.");
    return view;
  }
  /** Do not retain a session/database transaction while calling an external provider. */
  public LyricsSearch.Result get(UUID session,String token,UUID call){
    var before=context(session,token,call);
    var result=search.find(session,before.active().title(),before.active().artist());
    var after=context(session,token,call);
    if(!java.util.Objects.equals(before.active().title(),after.active().title())||!java.util.Objects.equals(before.active().artist(),after.active().artist()))
      throw new ResponseStatusException(HttpStatus.CONFLICT,"A música foi atualizada. Consulte a letra novamente.");
    return result;
  }
}
