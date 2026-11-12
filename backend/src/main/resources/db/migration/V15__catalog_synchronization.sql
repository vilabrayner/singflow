ALTER TABLE singflow.catalog_songs ADD COLUMN lastfm_url varchar(2048), ADD COLUMN lastfm_mbid varchar(36);
CREATE TABLE singflow.catalog_sync_runs (
 id uuid PRIMARY KEY, status varchar(16) NOT NULL CHECK(status IN ('RUNNING','PAUSED','COMPLETED')),
 started_by varchar(254) NOT NULL, runner varchar(254) NOT NULL,
 message varchar(300) NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX catalog_one_active_sync ON singflow.catalog_sync_runs((true)) WHERE status IN ('RUNNING','PAUSED');
CREATE TABLE singflow.catalog_sync_items (
 id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES singflow.catalog_sync_runs(id),
 song_id uuid NOT NULL REFERENCES singflow.catalog_songs(id),
 title varchar(160) NOT NULL, artist varchar(160) NOT NULL, song_version bigint NOT NULL,
 state varchar(24) NOT NULL DEFAULT 'QUEUED' CHECK(state IN ('QUEUED','PROCESSING','AUTO_APPROVED','REVIEW','APPROVED','MERGED','SKIPPED','FAILED')),
 revision bigint NOT NULL DEFAULT 0, attempts integer NOT NULL DEFAULT 0,
 claim_token uuid, lease_until timestamptz, next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 message varchar(300) NOT NULL DEFAULT '', reviewed_by varchar(254),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(run_id,song_id),
 CHECK((state='PROCESSING')=(claim_token IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX catalog_sync_queue ON singflow.catalog_sync_items(run_id,state,next_attempt_at);
CREATE INDEX catalog_sync_activity ON singflow.catalog_sync_items(run_id,updated_at DESC,id);
CREATE TABLE singflow.catalog_sync_candidates (
 item_id uuid NOT NULL REFERENCES singflow.catalog_sync_items(id), position integer NOT NULL CHECK(position BETWEEN 0 AND 9),
 title varchar(160) NOT NULL, artist varchar(160) NOT NULL,
 lastfm_url varchar(2048) NOT NULL DEFAULT '', lastfm_mbid varchar(36) NOT NULL DEFAULT '', score integer NOT NULL,
 PRIMARY KEY(item_id,position)
);
CREATE TABLE singflow.catalog_sync_audit (
 id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES singflow.catalog_sync_runs(id), item_id uuid REFERENCES singflow.catalog_sync_items(id),
 actor varchar(254) NOT NULL, action varchar(24) NOT NULL, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
