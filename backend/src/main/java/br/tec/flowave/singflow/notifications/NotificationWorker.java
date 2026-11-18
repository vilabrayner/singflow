package br.tec.flowave.singflow.notifications;

import jakarta.annotation.PreDestroy;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

@Configuration(proxyBeanMethods=false)
@ConditionalOnProperty(name="SINGFLOW_NOTIFICATIONS_WORKER_ENABLED",havingValue="true",matchIfMissing=true)
class NotificationWorker {
  private final NotificationConfig config;
  private final NotificationOutbox queue;
  private final NotificationTransport transport;
  private final AtomicBoolean running=new AtomicBoolean();
  private final ExecutorService worker=new ThreadPoolExecutor(0,1,30,TimeUnit.SECONDS,new ArrayBlockingQueue<>(1),task->{var thread=new Thread(task,"singflow-notification-delivery");thread.setDaemon(true);return thread;},new ThreadPoolExecutor.AbortPolicy());
  NotificationWorker(NotificationConfig config,NotificationOutbox queue,NotificationTransport transport){this.config=config;this.queue=queue;this.transport=transport;}
  @Bean ThreadPoolTaskScheduler notificationsScheduler(){var scheduler=new ThreadPoolTaskScheduler();scheduler.setPoolSize(1);scheduler.setThreadNamePrefix("singflow-notification-clock-");return scheduler;}
  @Scheduled(scheduler="notificationsScheduler",fixedDelay=1000)
  public void tick(){
    if(!config.anyEnabled()||!running.compareAndSet(false,true))return;
    try{worker.execute(()->{try{processOne();}catch(RuntimeException e){org.slf4j.LoggerFactory.getLogger(getClass()).warn("Delivery will be re-evaluated from persisted state.");}finally{running.set(false);}});}catch(RejectedExecutionException e){running.set(false);}
  }
  void processOne(){queue.claim().ifPresent(claim->{var delivery=queue.delivery(claim);queue.finish(claim,delivery.map(transport::send).orElseGet(NotificationTransport.Result::skipped));});}
  @PreDestroy void stop(){worker.shutdownNow();}
}
