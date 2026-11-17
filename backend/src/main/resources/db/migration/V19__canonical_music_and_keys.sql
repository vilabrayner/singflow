-- Musical names belong exclusively to the catalogue. Preserve original operation evidence.
ALTER TABLE singflow.catalog_songs ADD COLUMN original_key varchar(4);
ALTER TABLE singflow.catalog_audit ADD COLUMN original_song_id uuid;
UPDATE singflow.catalog_audit SET original_song_id=song_id;
ALTER TABLE singflow.catalog_audit ALTER COLUMN original_song_id SET NOT NULL;
CREATE TABLE singflow.catalog_redirects (
 source_id uuid PRIMARY KEY, target_id uuid NOT NULL REFERENCES singflow.catalog_songs(id),
 merged_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO singflow.catalog_redirects(source_id,target_id)
 SELECT id,singflow.catalog_root(id) FROM singflow.catalog_songs WHERE status='MERGED';
CREATE OR REPLACE FUNCTION singflow.catalog_root(uuid) RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT coalesce((SELECT target_id FROM singflow.catalog_redirects WHERE source_id=$1),
                 (SELECT id FROM singflow.catalog_songs WHERE id=$1))
$$;
-- A sync run may contain several original items now pointing to the same canonical song.
ALTER TABLE singflow.catalog_sync_items DROP CONSTRAINT catalog_sync_items_run_id_song_id_key;
ALTER TABLE singflow.catalog_sync_items ADD COLUMN original_song_id uuid;
UPDATE singflow.catalog_sync_items SET original_song_id=song_id;
ALTER TABLE singflow.catalog_sync_items ALTER COLUMN original_song_id SET NOT NULL;
ALTER TABLE singflow.catalog_sync_items ADD UNIQUE(run_id,original_song_id);
UPDATE singflow.song_requests SET catalog_song_id=singflow.catalog_root(catalog_song_id);
UPDATE singflow.stage_calls SET catalog_song_id=singflow.catalog_root(catalog_song_id);
UPDATE singflow.catalog_aliases SET song_id=singflow.catalog_root(song_id);
UPDATE singflow.catalog_audit SET song_id=singflow.catalog_root(song_id);
UPDATE singflow.catalog_import_operations SET song_id=singflow.catalog_root(song_id);
UPDATE singflow.catalog_sync_items SET song_id=singflow.catalog_root(song_id);
-- Keep metadata from absorbed entries when the destination has no equivalent value.
DO $$ DECLARE old record; BEGIN
 FOR old IN SELECT * FROM singflow.catalog_songs WHERE status='MERGED' ORDER BY created_at,id LOOP
  UPDATE singflow.catalog_songs SET spotify_url=coalesce(spotify_url,old.spotify_url),
    youtube_url=coalesce(youtube_url,old.youtube_url),lyrics_url=coalesce(lyrics_url,old.lyrics_url),
    chords_url=coalesce(chords_url,old.chords_url),lastfm_url=coalesce(lastfm_url,old.lastfm_url),
    lastfm_mbid=coalesce(lastfm_mbid,old.lastfm_mbid)
   WHERE id=singflow.catalog_root(old.id);
 END LOOP;
END $$;
UPDATE singflow.catalog_songs SET merged_into=NULL,status='PENDING' WHERE status='MERGED';
DELETE FROM singflow.catalog_songs WHERE id IN (SELECT source_id FROM singflow.catalog_redirects);
ALTER TABLE singflow.song_requests ADD COLUMN creation_fingerprint varchar(32);
UPDATE singflow.song_requests SET creation_fingerprint=md5(trim(title)||chr(31)||coalesce(nullif(trim(artist),''),''));
ALTER TABLE singflow.song_requests ALTER COLUMN creation_fingerprint SET NOT NULL;
ALTER TABLE singflow.song_requests ADD COLUMN semitones integer NOT NULL DEFAULT 0;
ALTER TABLE singflow.song_requests ADD COLUMN settings_version bigint NOT NULL DEFAULT 0;
ALTER TABLE singflow.song_requests ADD CONSTRAINT request_semitones_range CHECK(semitones BETWEEN -24 AND 24);
ALTER TABLE singflow.stage_calls ADD COLUMN choice_fingerprint varchar(32);
UPDATE singflow.stage_calls SET choice_fingerprint=md5(trim(title)||chr(31)||coalesce(nullif(trim(artist),''),'')) WHERE title IS NOT NULL;
ALTER TABLE singflow.stage_calls ADD COLUMN semitones integer NOT NULL DEFAULT 0;
ALTER TABLE singflow.stage_calls ADD COLUMN performed_key varchar(4);
ALTER TABLE singflow.stage_calls ADD COLUMN key_version bigint NOT NULL DEFAULT 0;
ALTER TABLE singflow.stage_calls ADD CONSTRAINT call_semitones_range CHECK(semitones BETWEEN -24 AND 24);
-- Fail safely if a legacy musical record has no catalogue link; never discard its name.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM singflow.song_requests WHERE catalog_song_id IS NULL)
 OR EXISTS(SELECT 1 FROM singflow.stage_calls WHERE title IS NOT NULL AND catalog_song_id IS NULL)
 THEN RAISE EXCEPTION 'Musical records without catalogue references must be repaired before V19'; END IF;
END $$;
ALTER TABLE singflow.song_requests ALTER COLUMN catalog_song_id SET NOT NULL;
ALTER TABLE singflow.song_requests DROP COLUMN title, DROP COLUMN artist;
ALTER TABLE singflow.stage_calls DROP COLUMN title, DROP COLUMN artist;
