package br.tec.flowave.singflow.sessions.endpoints;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
class ApiErrors {
  @ExceptionHandler(ResponseStatusException.class)
  ProblemDetail state(ResponseStatusException error) {
    return ProblemDetail.forStatusAndDetail(
        error.getStatusCode(),
        error.getReason() == null ? "Operação indisponível." : error.getReason());
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
