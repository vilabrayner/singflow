package br.tec.flowave.singflow.realtime;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/** External catalog calls must never occupy the clocks used by live stage notifications. */
@Configuration(proxyBeanMethods = false)
class RealtimeScheduling {
  @Bean
  ThreadPoolTaskScheduler taskScheduler() {
    // Keep an explicit default: otherwise a unique realtime scheduler would also
    // be selected for unqualified catalog @Scheduled methods by Spring.
    return scheduler("singflow-background-clock-", 1);
  }

  @Bean
  ThreadPoolTaskScheduler realtimeScheduler() {
    // A slow heartbeat send cannot occupy the clock that dispatches changes.
    return scheduler("singflow-realtime-clock-", 2);
  }

  private ThreadPoolTaskScheduler scheduler(String prefix, int threads) {
    var scheduler = new ThreadPoolTaskScheduler();
    scheduler.setPoolSize(threads);
    scheduler.setThreadNamePrefix(prefix);
    scheduler.setRemoveOnCancelPolicy(true);
    return scheduler;
  }
}
