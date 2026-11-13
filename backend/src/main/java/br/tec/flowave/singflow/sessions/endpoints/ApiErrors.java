package br.tec.flowave.singflow.sessions.endpoints;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
class ApiErrors {
  @ExceptionHandler(ResponseStatusException.class)
  ResponseEntity<ProblemDetail> state(ResponseStatusException error) {
    return ResponseEntity.status(error.getStatusCode())
        .headers(error.getHeaders())
        .body(
            ProblemDetail.forStatusAndDetail(
                error.getStatusCode(),
                error.getReason() == null ? "Operação indisponível." : error.getReason()));
  }

  @ExceptionHandler(org.springframework.http.converter.HttpMessageNotReadableException.class)
  ProblemDetail unreadable() {
    return ProblemDetail.forStatusAndDetail(
        HttpStatus.BAD_REQUEST,
        "Não foi possível ler os dados enviados. Confira os campos e tente novamente.");
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  ProblemDetail validation() {
    return ProblemDetail.forStatusAndDetail(
        HttpStatus.BAD_REQUEST, "Confira os campos obrigatórios e seus limites.");
  }

  @ExceptionHandler(DataIntegrityViolationException.class)
  ProblemDetail conflict() {
    return ProblemDetail.forStatusAndDetail(
        HttpStatus.CONFLICT,
        "Registro já utilizado ou vínculo inválido. Atualize a lista antes de repetir.");
  }
}
