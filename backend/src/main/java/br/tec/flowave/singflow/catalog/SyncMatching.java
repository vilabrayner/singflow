package br.tec.flowave.singflow.catalog;

import java.text.Normalizer;
import java.util.*;

public final class SyncMatching {
  private SyncMatching() {}

  static String normalize(String value) {
    return Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFC)
        .strip()
        .replaceAll("\\s+", " ")
        .toLowerCase(Locale.ROOT);
  }

  public static boolean exact(String title, String artist, SongSearch.Song candidate) {
    return !normalize(artist).isBlank()
        && normalize(title).equals(normalize(candidate.title()))
        && normalize(artist).equals(normalize(candidate.artist()));
  }

  static int similarity(String one, String two) {
    one = normalize(one);
    two = normalize(two);
    int[] prev = new int[two.length() + 1];
    for (int j = 0; j < prev.length; j++) prev[j] = j;
    for (int i = 1; i <= one.length(); i++) {
      int[] curr = new int[two.length() + 1];
      curr[0] = i;
      for (int j = 1; j <= two.length(); j++)
        curr[j] =
            Math.min(
                Math.min(curr[j - 1] + 1, prev[j] + 1),
                prev[j - 1] + (one.charAt(i - 1) == two.charAt(j - 1) ? 0 : 1));
      prev = curr;
    }
    int length = Math.max(one.length(), two.length());
    return length == 0 ? 100 : (int) Math.round(100.0 * (length - prev[two.length()]) / length);
  }

  static int score(String title, String artist, SongSearch.Song song) {
    int titleScore = similarity(title, song.title());
    return normalize(artist).isBlank()
        ? titleScore
        : (titleScore * 7 + similarity(artist, song.artist()) * 3) / 10;
  }

  static List<SongSearch.Song> rank(String title, String artist, List<SongSearch.Song> songs) {
    return songs.stream()
        .filter(
            s ->
                s != null
                    && s.title() != null
                    && !s.title().isBlank()
                    && s.title().length() <= 160
                    && s.artist() != null
                    && !s.artist().isBlank()
                    && s.artist().length() <= 160)
        .distinct()
        .sorted(Comparator.comparingInt((SongSearch.Song s) -> score(title, artist, s)).reversed())
        .limit(10)
        .toList();
  }
}
