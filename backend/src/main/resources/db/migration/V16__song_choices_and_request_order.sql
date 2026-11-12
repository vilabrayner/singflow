CREATE TABLE singflow.lastfm_choices (
 id uuid PRIMARY KEY, fingerprint varchar(64) NOT NULL UNIQUE,
 title varchar(160) NOT NULL, artist varchar(160) NOT NULL,
 lastfm_url varchar(2048) NOT NULL, lastfm_mbid varchar(36) NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE INDEX lastfm_choices_expiry ON singflow.lastfm_choices(expires_at);
CREATE SEQUENCE singflow.song_request_order_seq;
ALTER TABLE singflow.song_requests ADD COLUMN request_order bigint;
WITH ordered AS (SELECT id,row_number() OVER(ORDER BY created_at,id) AS position FROM singflow.song_requests)
 UPDATE singflow.song_requests r SET request_order=o.position FROM ordered o WHERE o.id=r.id;
SELECT setval('singflow.song_request_order_seq',coalesce(max(request_order),0)+1,false) FROM singflow.song_requests;
ALTER TABLE singflow.song_requests ALTER COLUMN request_order SET DEFAULT nextval('singflow.song_request_order_seq');
ALTER TABLE singflow.song_requests ALTER COLUMN request_order SET NOT NULL;
CREATE INDEX requests_person_order ON singflow.song_requests(session_id,participant_id,request_order);
CREATE TABLE singflow.request_reorders (
 operation_id uuid PRIMARY KEY,session_id uuid NOT NULL REFERENCES singflow.sessions(id),
 participant_id uuid NOT NULL,expected_ids uuid[] NOT NULL,ordered_ids uuid[] NOT NULL,
 FOREIGN KEY(session_id,participant_id) REFERENCES singflow.participants(session_id,id)
);
