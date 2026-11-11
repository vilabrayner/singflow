-- Existing accounts keep their access. Self-registration explicitly inserts PENDING/unverified.
ALTER TABLE singflow.host_accounts
    ADD COLUMN display_name varchar(120) NOT NULL DEFAULT '',
    ADD COLUMN email_verified boolean NOT NULL DEFAULT true,
    ADD COLUMN status varchar(16) NOT NULL DEFAULT 'APPROVED'
        CHECK (status IN ('PENDING','APPROVED','REJECTED','SUSPENDED')),
    ADD COLUMN administrator boolean NOT NULL DEFAULT false,
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN account_version bigint NOT NULL DEFAULT 0;

CREATE TABLE singflow.account_verifications (
    email varchar(254) PRIMARY KEY REFERENCES singflow.host_accounts(email),
    token_hash varchar(64) NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE singflow.account_audit (
    id uuid PRIMARY KEY,
    email varchar(254) NOT NULL REFERENCES singflow.host_accounts(email),
    actor varchar(254) NOT NULL,
    action varchar(40) NOT NULL,
    reason varchar(500) NOT NULL DEFAULT '',
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX account_audit_email_time ON singflow.account_audit(email,occurred_at);
CREATE INDEX accounts_status_created ON singflow.host_accounts(status,created_at,email);

-- Independent of audience limits to preserve module boundaries.
CREATE TABLE singflow.account_rate_limits (
    bucket_key varchar(64) PRIMARY KEY,
    window_start timestamptz NOT NULL,
    hits integer NOT NULL
);
