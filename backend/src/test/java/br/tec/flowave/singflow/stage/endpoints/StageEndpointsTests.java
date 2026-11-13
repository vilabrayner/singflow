package br.tec.flowave.singflow.stage.endpoints;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import br.tec.flowave.singflow.stage.StageService;
import java.util.UUID;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class StageEndpointsTests {
  @ParameterizedTest
  @ValueSource(strings = {"omitted", "null", "false", "true"})
  void onlyExplicitTrueAllowsCallingOutOfOrder(String value) throws Exception {
    var stage = mock(StageService.class);
    var mvc = MockMvcBuilders.standaloneSetup(new StageEndpoints(stage)).build();
    UUID session = UUID.randomUUID(),
        operation = UUID.randomUUID(),
        participant = UUID.randomUUID(),
        request = UUID.randomUUID();
    String flag = value.equals("omitted") ? "" : ",\"allowOutOfOrder\":" + value;
    mvc.perform(
            post("/api/sessions/" + session + "/stage/calls")
                .principal(() -> "host@example.test")
                .contentType("application/json")
                .content(
                    "{\"operationId\":\""
                        + operation
                        + "\",\"participantId\":\""
                        + participant
                        + "\",\"expectedRequestId\":\""
                        + request
                        + "\""
                        + flag
                        + "}"))
        .andExpect(status().isOk());
    verify(stage)
        .confirm(
            session,
            "host@example.test",
            operation,
            participant,
            request,
            null,
            null,
            null,
            value.equals("true"));
  }
}
