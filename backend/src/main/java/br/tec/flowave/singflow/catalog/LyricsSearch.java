package br.tec.flowave.singflow.catalog;

/** Lyrics are separate from streaming links: content is fetched only for an authorized presentation. */
public interface LyricsSearch {
  record Result(String status,String provider,String title,String artist,String text,String sourceUrl) {}
  Result find(String title,String artist);
}
