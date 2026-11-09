package br.tec.flowave.singflow;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;
import static org.assertj.core.api.Assertions.assertThat;

class ArchitectureTests {
    @Test
    void verifiesModuleBoundaries() {
        var modules = ApplicationModules.of(SingflowApplication.class);
        modules.verify();
        assertThat(modules.getModuleByName("identity")).isPresent();
    }
}
