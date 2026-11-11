package br.tec.flowave.singflow.identity;

import org.springframework.context.annotation.*;
import org.springframework.core.env.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;

@Configuration(proxyBeanMethods = false)
class SecurityConfiguration {
  @Bean
  PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }

  @Bean
  UserDetailsService userDetailsService(JdbcClient jdbc) {
    return email ->
        jdbc.sql(
                "SELECT email, password_hash, role FROM singflow.host_accounts WHERE email ="
                    + " :email")
            .param("email", email.trim().toLowerCase(java.util.Locale.ROOT))
            .query(
                (rs, row) ->
                    User.withUsername(rs.getString("email"))
                        .password(rs.getString("password_hash"))
                        .roles(rs.getString("role"))
                        .build())
            .optional()
            .orElseThrow(() -> new UsernameNotFoundException("Credenciais inválidas"));
  }

  @Bean
  SecurityFilterChain securityFilterChain(HttpSecurity http, Environment environment)
      throws Exception {
    http.authorizeHttpRequests(
        access -> {
          access
              .requestMatchers(
                  "/actuator/health", "/api/auth/csrf", "/api/public/**", "/api/participation/**")
              .permitAll();
          if (environment.acceptsProfiles(Profiles.of("local"))) {
            access
                .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html")
                .permitAll();
          }
          access
              .requestMatchers("/api/auth/me", "/api/musicians/**")
              .hasAnyRole("HOST", "MUSICIAN");
          access.requestMatchers("/api/sessions", "/api/sessions/**").hasRole("HOST");
          access.anyRequest().denyAll();
        });
    http.formLogin(
        form ->
            form.loginPage("/anfitriao")
                .loginProcessingUrl("/api/auth/login")
                .usernameParameter("email")
                .successHandler((request, response, auth) -> response.setStatus(204))
                .failureHandler((request, response, error) -> response.setStatus(401))
                .permitAll());
    http.logout(
        logout ->
            logout
                .logoutUrl("/api/auth/logout")
                .invalidateHttpSession(true)
                .deleteCookies("JSESSIONID")
                .logoutSuccessHandler((request, response, auth) -> response.setStatus(204)));
    http.requestCache(cache -> cache.disable())
        .exceptionHandling(
            errors ->
                errors.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)));
    return http.build();
  }
}
