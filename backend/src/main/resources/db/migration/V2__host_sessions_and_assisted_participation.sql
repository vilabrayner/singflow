CREATE TABLE singflow.host_accounts (
    email varchar(254) PRIMARY KEY,
    password_hash varchar(100) NOT NULL
);
CREATE TABLE singflow.sessions (
    id uuid PRIMARY KEY,
    owner varchar(254) NOT NULL REFERENCES singflow.host_accounts(email),
    name varchar(120) NOT NULL CHECK (length(trim(name)) > 0),
    status varchar(12) NOT NULL CHECK (status IN ('DRAFT','OPEN','CLOSED')),
    created_at timestamptz NOT NULL,
    version bigint NOT NULL DEFAULT 0
);
CREATE INDEX sessions_owner_idx ON singflow.sessions(owner,created_at);
CREATE TABLE singflow.participants (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES singflow.sessions(id),
    name varchar(120) NOT NULL CHECK (length(trim(name)) > 0),
    table_label varchar(40),
    status varchar(12) NOT NULL CHECK (status IN ('ACTIVE','LEFT')),
    origin varchar(12) NOT NULL CHECK (origin = 'ASSISTED'),
    checked_in_at timestamptz NOT NULL,
    check_in_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    completed_performances integer NOT NULL DEFAULT 0 CHECK (completed_performances >= 0),
    version bigint NOT NULL DEFAULT 0,
    UNIQUE(session_id,id)
);
CREATE INDEX participants_session_idx ON singflow.participants(session_id,check_in_order);
CREATE TABLE singflow.song_requests (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    title varchar(160) NOT NULL CHECK (length(trim(title)) > 0),
    artist varchar(160),
    status varchar(12) NOT NULL CHECK (status IN ('PENDING','CANCELLED')),
    created_at timestamptz NOT NULL,
    FOREIGN KEY(session_id,participant_id) REFERENCES singflow.participants(session_id,id)
);
CREATE INDEX requests_session_idx ON singflow.song_requests(session_id,created_at);
CREATE TABLE singflow.audit_events (
    id uuid PRIMARY KEY,
    actor varchar(254) NOT NULL,
    session_id uuid NOT NULL REFERENCES singflow.sessions(id),
    action varchar(60) NOT NULL,
    target_id uuid NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX audit_session_idx ON singflow.audit_events(session_id,occurred_at);
