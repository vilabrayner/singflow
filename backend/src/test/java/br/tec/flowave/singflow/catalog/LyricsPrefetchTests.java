package br.tec.flowave.singflow.catalog;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronizationManager;

class LyricsPrefetchTests {
  private static final java.util.UUID SESSION=java.util.UUID.randomUUID();
  @Test void runsOutsideCallerAndDeduplicatesPendingSongs() throws Exception {
    var search=mock(LyricsSessionCache.class);var started=new CountDownLatch(1);var release=new CountDownLatch(1);
    String caller=Thread.currentThread().getName();
    when(search.find(SESSION,"Giz","Artist")).thenAnswer(i->{assertThat(Thread.currentThread().getName()).isNotEqualTo(caller);assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();started.countDown();release.await(5,TimeUnit.SECONDS);return null;});
    var executor=Executors.newSingleThreadExecutor();var prefetch=new LyricsPrefetch(search,true,executor);
    try{
      assertThat(prefetch.prepare(SESSION,"Giz","Artist")).isTrue();assertThat(started.await(2,TimeUnit.SECONDS)).isTrue();
      assertThat(prefetch.prepare(SESSION,"GIZ","ARTIST")).isFalse();verify(search).find(SESSION,"Giz","Artist");
    }finally{release.countDown();prefetch.close();}
  }
  @Test void fullQueueNeverExecutesProviderOnCallingThread() throws Exception {
    var search=mock(LyricsSessionCache.class);var started=new CountDownLatch(1);var release=new CountDownLatch(1);var done=new CountDownLatch(2);
    when(search.find(eq(SESSION),anyString(),anyString())).thenAnswer(i->{started.countDown();release.await(5,TimeUnit.SECONDS);done.countDown();return null;});
    var executor=new ThreadPoolExecutor(1,1,0,TimeUnit.SECONDS,new ArrayBlockingQueue<>(1),new ThreadPoolExecutor.AbortPolicy());
    var prefetch=new LyricsPrefetch(search,true,executor);
    try{
      assertThat(prefetch.prepare(SESSION,"One","Artist")).isTrue();assertThat(started.await(2,TimeUnit.SECONDS)).isTrue();
      assertThat(prefetch.prepare(SESSION,"Two","Artist")).isTrue();assertThat(prefetch.prepare(SESSION,"Three","Artist")).isFalse();
      verify(search,never()).find(SESSION,"Three","Artist");release.countDown();assertThat(done.await(2,TimeUnit.SECONDS)).isTrue();
    }finally{release.countDown();prefetch.close();}
  }
  @Test void disabledOrIncompleteMetadataNeverSchedulesLookup(){
    var search=mock(LyricsSessionCache.class);var executor=Executors.newSingleThreadExecutor();var prefetch=new LyricsPrefetch(search,false,executor);
    try{assertThat(prefetch.prepare(SESSION,"Giz","Artist")).isFalse();assertThat(prefetch.prepare(SESSION,"Giz",null)).isFalse();verifyNoInteractions(search);}finally{prefetch.close();}
  }
  @Test void failureReleasesDeduplicationAndShutdownDoesNotAffectCaller() throws Exception {
    var search=mock(LyricsSessionCache.class);when(search.find(eq(SESSION),anyString(),anyString())).thenThrow(new IllegalStateException("Simulated failure"));
    var executor=Executors.newSingleThreadExecutor();var prefetch=new LyricsPrefetch(search,true,executor);
    try{
      assertThat(prefetch.prepare(SESSION,"Giz","Artist")).isTrue();executor.submit(()->{}).get(2,TimeUnit.SECONDS);
      assertThat(prefetch.prepare(SESSION,"Giz","Artist")).isTrue();executor.submit(()->{}).get(2,TimeUnit.SECONDS);
      verify(search,times(2)).find(SESSION,"Giz","Artist");
    }finally{prefetch.close();}
    assertThat(prefetch.prepare(SESSION,"Another","Artist")).isFalse();
  }
}
