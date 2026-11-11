-- Stable opaque identifiers for selecting musicians without exposing their login email.
ALTER TABLE singflow.host_accounts
    ADD COLUMN account_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE singflow.host_accounts ADD CONSTRAINT account_public_id_unique UNIQUE(account_id);
