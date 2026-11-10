ALTER TABLE singflow.participant_grants ADD COLUMN departure varchar(24)
    CHECK (departure IN ('SELF', 'SELF_RESTRICTED', 'HOST'));

-- Previously revoked grants stay revoked. Never recover credentials by name.
CREATE TABLE singflow.participant_returns (
    operation_id uuid PRIMARY KEY,
    grant_id uuid NOT NULL REFERENCES singflow.participant_grants(id),
    title varchar(160) NOT NULL,
    artist varchar(160)
);
