ALTER TABLE singflow.stage_calls ADD COLUMN accepted_at timestamptz;

ALTER TABLE singflow.participants ADD COLUMN self_paused boolean NOT NULL DEFAULT false;
ALTER TABLE singflow.participants ADD CONSTRAINT participant_self_pause_status
    CHECK (NOT self_paused OR status = 'PAUSED');
