package br.tec.flowave.singflow.catalog;
import static org.assertj.core.api.Assertions.*;
import org.junit.jupiter.api.Test;
class MusicKeyTests {
 @Test void displaysOriginalSignedOffsetsAndCalculatedKeys() {
  assertThat(MusicKey.label(null,0)).isEqualTo("Original");
  assertThat(MusicKey.label("D",0)).isEqualTo("D (Original)");
  assertThat(MusicKey.label(null,1)).isEqualTo("+1");
  assertThat(MusicKey.label(null,-2)).isEqualTo("-2");
  assertThat(MusicKey.label("D",-2)).isEqualTo("C");
  assertThat(MusicKey.label("B",1)).isEqualTo("C");
  assertThat(MusicKey.label("Am",-2)).isEqualTo("Gm");
  assertThat(MusicKey.label("Bb",-2)).isEqualTo("Ab");
  assertThat(MusicKey.label("C",-24)).isEqualTo("C");
 }
 @Test void validatesNotationAndKeepsOperationIdentitySeparateFromMutableCatalogue() {
  assertThat(MusicKey.normalize(" F♯m ")).isEqualTo("F#m");
  assertThat(MusicKey.normalize(" ")).isNull();
  assertThatThrownBy(()->MusicKey.normalize("Ré maior")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
  assertThat(MusicKey.fingerprint(" Giz ",null)).isEqualTo(MusicKey.fingerprint("Giz",""));
  assertThat(MusicKey.fingerprint("Giz","A")).isNotEqualTo(MusicKey.fingerprint("Giz","B"));
 }
}
