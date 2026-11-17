package br.tec.flowave.singflow.catalog;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Pitch classes use international notation; minor mode is retained during transposition. */
public final class MusicKey {
  private MusicKey() {}
  public static String normalize(String value) {
    if (value == null || value.isBlank()) return null;
    String key=value.strip().replace("♯", "#").replace("♭", "b");
    if (!key.matches("[A-G](#|b)?m?"))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Informe um tom como C, D#, Bb ou Am.");
    return key;
  }
  public static String label(String original, int semitones) {
    if (original == null || original.isBlank()) return semitones==0 ? "Original" : (semitones>0?"+":"")+semitones;
    if (semitones==0) return original+" (Original)";
    boolean minor=original.endsWith("m");
    int pitch=switch(original.charAt(0)){case 'C'->0;case 'D'->2;case 'E'->4;case 'F'->5;case 'G'->7;case 'A'->9;default->11;};
    if(original.contains("#")) pitch++;
    if(original.contains("b")) pitch--;
    String[] notes=original.contains("b")?new String[]{"C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"}:new String[]{"C","C#","D","D#","E","F","F#","G","G#","A","A#","B"};
    return notes[Math.floorMod(pitch+semitones,12)]+(minor?"m":"");
  }
  /** Payload identity only, not a password or security token. */
  public static String fingerprint(String title,String artist) {
    try { return HexFormat.of().formatHex(MessageDigest.getInstance("MD5").digest(
      (title.strip()+"\u001f"+(artist==null?"":artist.strip())).getBytes(StandardCharsets.UTF_8))); }
    catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}
  }
}
