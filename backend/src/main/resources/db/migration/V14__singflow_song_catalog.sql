-- Requests and stage calls retain their original display snapshots.
CREATE FUNCTION singflow.catalog_key(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT lower(regexp_replace(trim(coalesce($1,'')), '[[:space:]]+', ' ', 'g'))
$$;
CREATE TABLE singflow.catalog_songs (
 id uuid PRIMARY KEY,
 title varchar(160) NOT NULL CHECK(length(trim(title))>0),
 artist varchar(160) NOT NULL DEFAULT '',
 status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','MERGED')),
 source varchar(16) NOT NULL CHECK(source IN ('LEGACY','REQUEST','ADMIN')),
 merged_into uuid REFERENCES singflow.catalog_songs(id),
 spotify_url varchar(2048), youtube_url varchar(2048), lyrics_url varchar(2048), chords_url varchar(2048),
 version bigint NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((status='MERGED')=(merged_into IS NOT NULL)), CHECK(merged_into IS DISTINCT FROM id)
);
CREATE INDEX catalog_songs_review ON singflow.catalog_songs(status,updated_at,id);
CREATE TABLE singflow.catalog_aliases (
 title_key text NOT NULL, artist_key text NOT NULL,
 song_id uuid NOT NULL REFERENCES singflow.catalog_songs(id),
 PRIMARY KEY(title_key,artist_key)
);
CREATE INDEX catalog_aliases_song ON singflow.catalog_aliases(song_id);
CREATE FUNCTION singflow.catalog_root(uuid) RETURNS uuid LANGUAGE sql STABLE AS $$
 WITH RECURSIVE chain AS (
   SELECT id,status,merged_into FROM singflow.catalog_songs WHERE id=$1
   UNION
   SELECT s.id,s.status,s.merged_into FROM singflow.catalog_songs s JOIN chain c ON s.id=c.merged_into
 ) SELECT id FROM chain WHERE status<>'MERGED' LIMIT 1
$$;
CREATE TABLE singflow.catalog_audit (
 id uuid PRIMARY KEY, song_id uuid NOT NULL REFERENCES singflow.catalog_songs(id),
 actor varchar(254) NOT NULL, action varchar(24) NOT NULL, reason varchar(500) NOT NULL DEFAULT '',
 before_state jsonb, after_state jsonb NOT NULL, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX catalog_audit_song ON singflow.catalog_audit(song_id,occurred_at);
ALTER TABLE singflow.song_requests ADD COLUMN catalog_song_id uuid REFERENCES singflow.catalog_songs(id);
ALTER TABLE singflow.stage_calls ADD COLUMN catalog_song_id uuid REFERENCES singflow.catalog_songs(id);
CREATE INDEX requests_catalog_song ON singflow.song_requests(catalog_song_id);
CREATE INDEX stage_catalog_song ON singflow.stage_calls(catalog_song_id);

-- One provisional entry per exact normalized title/artist, with no guessing across artists/versions.
WITH snapshots AS (
 SELECT title,coalesce(artist,'') AS artist FROM singflow.song_requests
 UNION ALL SELECT title,coalesce(artist,'') FROM singflow.stage_calls WHERE title IS NOT NULL
), distinct_songs AS (
 SELECT DISTINCT ON (singflow.catalog_key(title),singflow.catalog_key(artist)) title,artist
 FROM snapshots WHERE length(trim(title))>0
 ORDER BY singflow.catalog_key(title),singflow.catalog_key(artist),title,artist
), inserted AS (
 INSERT INTO singflow.catalog_songs(id,title,artist,source)
 SELECT gen_random_uuid(),trim(title),trim(artist),'LEGACY' FROM distinct_songs RETURNING *
)
INSERT INTO singflow.catalog_aliases SELECT singflow.catalog_key(title),singflow.catalog_key(artist),id FROM inserted;
UPDATE singflow.song_requests r SET catalog_song_id=a.song_id FROM singflow.catalog_aliases a
 WHERE a.title_key=singflow.catalog_key(r.title) AND a.artist_key=singflow.catalog_key(r.artist);
UPDATE singflow.stage_calls c SET catalog_song_id=a.song_id FROM singflow.catalog_aliases a
 WHERE a.title_key=singflow.catalog_key(c.title) AND a.artist_key=singflow.catalog_key(c.artist) AND c.title IS NOT NULL;
INSERT INTO singflow.catalog_audit(id,song_id,actor,action,after_state)
 SELECT gen_random_uuid(),id,'system:migration','IMPORTED',to_jsonb(s) FROM singflow.catalog_songs s;
