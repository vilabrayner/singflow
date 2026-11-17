CREATE TABLE singflow.musician_chord_preferences (
 account_id uuid NOT NULL REFERENCES singflow.host_accounts(account_id),
 song_id uuid NOT NULL REFERENCES singflow.catalog_songs(id),
 url varchar(2048), version bigint NOT NULL DEFAULT 0,
 alternatives jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(alternatives)='array'),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(account_id,song_id)
);
CREATE INDEX musician_chords_song ON singflow.musician_chord_preferences(song_id);
CREATE TABLE singflow.musician_chord_audit (
 id uuid PRIMARY KEY,account_id uuid NOT NULL REFERENCES singflow.host_accounts(account_id),
 song_id uuid NOT NULL REFERENCES singflow.catalog_songs(id),original_song_id uuid NOT NULL,
 action varchar(24) NOT NULL,before_state jsonb,after_state jsonb,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX musician_chord_audit_song ON singflow.musician_chord_audit(song_id);
