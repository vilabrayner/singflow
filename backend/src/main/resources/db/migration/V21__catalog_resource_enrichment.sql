CREATE TABLE singflow.catalog_enrichment_jobs (
 song_id uuid NOT NULL REFERENCES singflow.catalog_songs(id), provider varchar(32) NOT NULL,
 title varchar(160) NOT NULL, artist varchar(160) NOT NULL,
 state varchar(24) NOT NULL CHECK(state IN ('QUEUED','PROCESSING','READY','NOT_FOUND','COMPLETED','FAILED','SKIPPED','WAITING_METADATA')),
 attempts integer NOT NULL DEFAULT 0, claim_token uuid, lease_until timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 message varchar(300) NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(song_id,provider),
 CHECK((state='PROCESSING')=(claim_token IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX catalog_enrichment_queue ON singflow.catalog_enrichment_jobs(state,next_attempt_at);
CREATE TABLE singflow.catalog_enrichment_candidates (
 song_id uuid NOT NULL, provider varchar(32) NOT NULL,
 position integer NOT NULL CHECK(position BETWEEN 0 AND 9), external_id varchar(160) NOT NULL,
 title varchar(512) NOT NULL, artist varchar(1024) NOT NULL, album varchar(512) NOT NULL DEFAULT '',
 duration_ms integer NOT NULL DEFAULT 0, url varchar(2048) NOT NULL, recommended boolean NOT NULL DEFAULT false,
 PRIMARY KEY(song_id,provider,position),
 FOREIGN KEY(song_id,provider) REFERENCES singflow.catalog_enrichment_jobs(song_id,provider) ON DELETE CASCADE
);
