CREATE TABLE singflow.participant_access_invites (
    session_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    token_hash varchar(64) NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (session_id, participant_id),
    FOREIGN KEY (session_id, participant_id) REFERENCES singflow.participants(session_id, id)
);
