package br.tec.flowave.singflow.realtime;

import jakarta.servlet.http.HttpSession;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.server.*;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.web.socket.*;
import org.springframework.web.socket.config.annotation.*;
import org.springframework.web.socket.server.HandshakeInterceptor;

@Configuration(proxyBeanMethods=false)
@EnableWebSocket
@EnableScheduling
class RealtimeConfiguration implements WebSocketConfigurer {
  private final RealtimeHub hub;
  private final String[] origins;
  RealtimeConfiguration(RealtimeHub hub,@Value("${SINGFLOW_PUBLIC_APP_URL:http://127.0.0.1:4200}") String app, @Value("${SINGFLOW_REALTIME_ALLOWED_ORIGINS:}") String extra, org.springframework.core.env.Environment environment){
    this.hub=hub;
    var uri=java.net.URI.create(app);
    var allowed=new LinkedHashSet<String>();
    allowed.add(uri.getScheme()+"://"+uri.getAuthority());
    for(String candidate:extra.split(",")){
      if(candidate.isBlank())continue;
      var value=java.net.URI.create(candidate.trim());
      if(!Set.of("http","https").contains(value.getScheme()) || value.getHost()==null || value.getUserInfo()!=null || value.getQuery()!=null || value.getFragment()!=null || !(value.getPath().isEmpty() || value.getPath().equals("/")))throw new IllegalArgumentException("Invalid realtime origin configuration");
      allowed.add(value.getScheme()+"://"+value.getAuthority());
    }
    if(environment.acceptsProfiles(org.springframework.core.env.Profiles.of("local"))){allowed.add("http://localhost:4200");allowed.add("http://127.0.0.1:4200");}
    this.origins=allowed.toArray(String[]::new);
  }
  @Override public void registerWebSocketHandlers(WebSocketHandlerRegistry registry){
    registry.addHandler(hub,"/api/realtime/ws","/api/participation/*/realtime/ws")
        .setAllowedOrigins(origins)
        .addInterceptors(new HandshakeInterceptor(){
          public boolean beforeHandshake(ServerHttpRequest req,ServerHttpResponse res,WebSocketHandler h,Map<String,Object> attrs){
            if(!(req instanceof ServletServerHttpRequest servlet) || req.getURI().getRawQuery()!=null)return false;
            HttpSession session=servlet.getServletRequest().getSession(false);
            if(session==null)return false;
            attrs.put("httpSession",session);
            return true;
          }
          public void afterHandshake(ServerHttpRequest a,ServerHttpResponse b,WebSocketHandler c,Exception d){}
        });
  }
}
