ALTER TABLE singflow.host_accounts ADD COLUMN role varchar(16) NOT NULL DEFAULT 'HOST'
    CHECK (role IN ('HOST','MUSICIAN'));

CREATE TABLE singflow.musician_session_grants (
    operation_id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES singflow.sessions(id),
    email varchar(254) NOT NULL REFERENCES singflow.host_accounts(email),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX musician_session_active_access
    ON singflow.musician_session_grants(session_id,email) WHERE active;
CREATE INDEX musician_session_access_by_email
    ON singflow.musician_session_grants(email,session_id) WHERE active;
