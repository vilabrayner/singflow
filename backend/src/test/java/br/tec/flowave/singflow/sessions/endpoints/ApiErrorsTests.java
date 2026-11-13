package br.tec.flowave.singflow.sessions.endpoints;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.*;

class ApiErrorsTests {
  record Input(UUID id) {}

  @RestController
  static class Endpoint {
    @PostMapping("/parse")
    Input parse(@RequestBody Input input) {
      return input;
    }
  }

  @Test
  void malformedJsonReturnsAHandledBadRequestWithoutExposingParserDetails() throws Exception {
    var mvc =
        MockMvcBuilders.standaloneSetup(new Endpoint())
            .setControllerAdvice(new ApiErrors())
            .build();
    mvc.perform(post("/parse").contentType("application/json").content("{\"id\":\"not-a-uuid\"}"))
        .andExpect(status().isBadRequest())
        .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
        .andExpect(
            jsonPath("$.detail")
                .value(
                    "Não foi possível ler os dados enviados. Confira os campos e tente"
                        + " novamente."));
  }
}
