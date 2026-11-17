package br.tec.flowave.singflow.catalog;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.junit.jupiter.api.Test;

class LyricsSessionCacheTests {
 static LyricsSearch.Result found(){return new LyricsSearch.Result("FOUND","LRCLIB","Giz","Artist","Texto sintético",null);}
 static class Fixture {
   final LyricsSearch provider=mock(LyricsSearch.class);
   final Set<UUID> open=ConcurrentHashMap.newKeySet();
   final AtomicLong time=new AtomicLong(1000);
   final LyricsSessionCache cache=new LyricsSessionCache(provider,ids->{var result=new HashSet<>(ids);result.retainAll(open);return result;},song->Set.copyOf(open),time::get);
   UUID session(){UUID id=UUID.randomUUID();open.add(id);return id;}
   void close(UUID id){open.remove(id);cache.closeSession(id);}
 }
 @Test void retainsFoundLyricsBeyondOldTtlWhileSessionIsOpenAndReleasesAtClose(){
   var f=new Fixture();var a=f.session();when(f.provider.find("Giz","Artist")).thenReturn(found());
   f.cache.find(a,"Giz","Artist");f.time.addAndGet(86400000);f.cache.find(a,"Giz","Artist");verify(f.provider).find("Giz","Artist");
   f.close(a);assertThat(f.cache.find(a,"Giz","Artist")).isNull();var b=f.session();f.cache.find(b,"Giz","Artist");verify(f.provider,times(2)).find("Giz","Artist");
 }
 @Test void sharedLyricsRemainUntilTheLastConsumingSessionCloses(){
   var f=new Fixture();var a=f.session();var b=f.session();when(f.provider.find("Giz","Artist")).thenReturn(found());
   f.cache.find(a,"Giz","Artist");f.cache.find(b,"Giz","Artist");f.close(a);f.cache.find(b,"Giz","Artist");verify(f.provider).find("Giz","Artist");
   f.close(b);var c=f.session();f.cache.find(c,"Giz","Artist");verify(f.provider,times(2)).find("Giz","Artist");
 }
 @Test void lateBackgroundTaskForClosedSessionDoesNotFetchOrRecreateCache(){
   var f=new Fixture();var a=f.session();f.close(a);assertThat(f.cache.find(a,"Giz","Artist")).isNull();assertThat(f.cache.findForSong(UUID.randomUUID(),"Giz","Artist")).isNull();verifyNoInteractions(f.provider);
 }
 @Test void closingDuringProviderLookupDoesNotWaitOrAllowLateRepopulation() throws Exception {
   var f=new Fixture();var a=f.session();var entered=new CountDownLatch(1);var release=new CountDownLatch(1);
   when(f.provider.find("Giz","Artist")).thenAnswer(i->{entered.countDown();release.await(5,TimeUnit.SECONDS);return found();});
   try(var pool=Executors.newFixedThreadPool(2)){
     var pending=pool.submit(()->f.cache.find(a,"Giz","Artist"));
     try{assertThat(entered.await(2,TimeUnit.SECONDS)).isTrue();pool.submit(()->f.close(a)).get(2,TimeUnit.SECONDS);}finally{release.countDown();}
     assertThat(pending.get(2,TimeUnit.SECONDS)).isNull();
   }
   var b=f.session();f.cache.find(b,"Giz","Artist");verify(f.provider,times(2)).find("Giz","Artist");
 }
 @Test void simultaneousSessionsShareOneInflightLookup() throws Exception {
   var f=new Fixture();var a=f.session();var b=f.session();var entered=new CountDownLatch(1);var release=new CountDownLatch(1);
   when(f.provider.find("Giz","Artist")).thenAnswer(i->{entered.countDown();release.await(5,TimeUnit.SECONDS);return found();});
   try(var pool=Executors.newFixedThreadPool(2)){
     var first=pool.submit(()->f.cache.find(a,"Giz","Artist"));
     try{assertThat(entered.await(2,TimeUnit.SECONDS)).isTrue();var second=pool.submit(()->f.cache.find(b,"Giz","Artist"));release.countDown();assertThat(first.get(2,TimeUnit.SECONDS)).isEqualTo(second.get(2,TimeUnit.SECONDS));}
     finally{release.countDown();}
   }
   verify(f.provider).find("Giz","Artist");
 }
 @Test void cachedLyricsDoNotWaitBehindAnotherSlowSong() throws Exception {
   var f=new Fixture();var a=f.session();var entered=new CountDownLatch(1);var release=new CountDownLatch(1);when(f.provider.find("Giz","Artist")).thenReturn(found());
   when(f.provider.find("Other","Artist")).thenAnswer(i->{entered.countDown();release.await(5,TimeUnit.SECONDS);return found();});f.cache.find(a,"Giz","Artist");
   try(var pool=Executors.newFixedThreadPool(2)){
     var slow=pool.submit(()->f.cache.find(a,"Other","Artist"));
     try{assertThat(entered.await(2,TimeUnit.SECONDS)).isTrue();assertThat(pool.submit(()->f.cache.find(a,"Giz","Artist")).get(2,TimeUnit.SECONDS).status()).isEqualTo("FOUND");}
     finally{release.countDown();}slow.get(2,TimeUnit.SECONDS);
   }
 }
 @Test void missingLyricsMayBeRetriedAfterTwoMinutesAndErrorsDoNotPoisonCache(){
   var f=new Fixture();var a=f.session();when(f.provider.find("Giz","Artist")).thenReturn(new LyricsSearch.Result("NOT_FOUND","LRCLIB","Giz","Artist",null,null));
   f.cache.find(a,"Giz","Artist");f.cache.find(a,"Giz","Artist");verify(f.provider).find("Giz","Artist");f.time.addAndGet(120001);f.cache.find(a,"Giz","Artist");verify(f.provider,times(2)).find("Giz","Artist");
   when(f.provider.find("Other","Artist")).thenThrow(new IllegalStateException("Simulated failure")).thenReturn(found());assertThatThrownBy(()->f.cache.find(a,"Other","Artist")).isInstanceOf(IllegalStateException.class);assertThat(f.cache.find(a,"Other","Artist").status()).isEqualTo("FOUND");
 }
 @Test void enrichmentAssociatesAllOpenSessionsUsingTheSong(){
   var f=new Fixture();var a=f.session();var b=f.session();when(f.provider.find("Giz","Artist")).thenReturn(found());f.cache.findForSong(UUID.randomUUID(),"Giz","Artist");f.close(a);f.cache.find(b,"Giz","Artist");verify(f.provider).find("Giz","Artist");
 }
}
