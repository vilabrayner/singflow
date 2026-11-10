ALTER TABLE singflow.participants DROP CONSTRAINT participants_origin_check;
ALTER TABLE singflow.participants ADD CONSTRAINT participants_origin_check CHECK (origin IN ('ASSISTED','SELF'));

CREATE TABLE singflow.entry_links (
 session_id uuid PRIMARY KEY REFERENCES singflow.sessions(id),
 code varchar(64) NOT NULL UNIQUE,
 operation_id uuid NOT NULL
);
CREATE TABLE singflow.participant_grants (
 id uuid PRIMARY KEY,
 session_id uuid NOT NULL REFERENCES singflow.sessions(id),
 participant_id uuid,
 token_hash varchar(64) NOT NULL UNIQUE,
 browser_hash varchar(64) NOT NULL,
 expires_at timestamptz NOT NULL,
 revoked boolean NOT NULL DEFAULT false,
 UNIQUE(session_id,browser_hash),
 FOREIGN KEY (session_id,participant_id) REFERENCES singflow.participants(session_id,id)
);
CREATE TABLE singflow.audience_rate_limits (
 bucket_key varchar(64) PRIMARY KEY,
 window_start timestamptz NOT NULL,
 hits integer NOT NULL
);
