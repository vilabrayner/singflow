package br.tec.flowave.singflow.catalog;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
class CatalogEnrichmentWorkerTests {
 @Test void lyricTextIsOnlyCachedAndNeverIncludedInPersistedCandidates(){
  var queue=mock(CatalogEnrichment.class);var lyrics=mock(LyricsSessionCache.class);var cifra=mock(CifraSearch.class);
  var claim=new CatalogEnrichment.Claim(UUID.randomUUID(),"lyrics","Giz","Artist",1,UUID.randomUUID());when(queue.claim()).thenReturn(Optional.of(claim));
  when(lyrics.findForSong(claim.songId(),"Giz","Artist")).thenReturn(new LyricsSearch.Result("FOUND","LRCLIB","Giz","Artist","Texto sintético",null));
  var worker=new CatalogEnrichmentWorker(queue,cifra,lyrics,List.of());try{worker.processOne();verify(lyrics).findForSong(claim.songId(),"Giz","Artist");verify(queue).complete(claim,List.of());}finally{worker.close();}
 }
 @Test void adaptsStreamingCandidatesWithoutPlatformBranches(){
  var queue=mock(CatalogEnrichment.class);var provider=mock(StreamingSearch.class);when(provider.provider()).thenReturn(new StreamingSearch.Provider("test","Test","fa-music"));
  var claim=new CatalogEnrichment.Claim(UUID.randomUUID(),"test","Giz","Artist",1,UUID.randomUUID());when(queue.claim()).thenReturn(Optional.of(claim));
  when(provider.search("Giz Artist",1)).thenReturn(new StreamingSearch.Page(new StreamingSearch.Provider("test","Test","fa-music"),List.of(new StreamingSearch.Track("test","id","Giz","Artist","Album",1000,"https://example.test/track")),1,false));
  var worker=new CatalogEnrichmentWorker(queue,mock(CifraSearch.class),mock(LyricsSessionCache.class),List.of(provider));
  try{worker.processOne();verify(queue).complete(claim,List.of(new CatalogEnrichment.Candidate("test","id","Giz","Artist","Album",1000,"https://example.test/track",false)));}finally{worker.close();}
 }
 @Test void providerFailurePersistsRetryAndDoesNotEscapeTheWorker(){
  var queue=mock(CatalogEnrichment.class);var lyrics=mock(LyricsSessionCache.class);var claim=new CatalogEnrichment.Claim(UUID.randomUUID(),"lyrics","Giz","Artist",1,UUID.randomUUID());when(queue.claim()).thenReturn(Optional.of(claim));
  var failure=new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS);when(lyrics.findForSong(any(),anyString(),anyString())).thenThrow(failure);
  var worker=new CatalogEnrichmentWorker(queue,mock(CifraSearch.class),lyrics,List.of());try{worker.processOne();verify(queue).failed(claim,failure);verify(queue,never()).complete(any(),any());}finally{worker.close();}
 }
}
