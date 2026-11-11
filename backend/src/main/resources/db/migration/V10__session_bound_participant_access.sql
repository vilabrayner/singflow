ALTER TABLE singflow.participant_grants ALTER COLUMN expires_at DROP NOT NULL;

-- Existing access to an open session follows the new lifetime. Revocations are preserved.
UPDATE singflow.participant_grants AS grant_access
SET expires_at = NULL
FROM singflow.sessions AS session
WHERE grant_access.session_id = session.id AND session.status = 'OPEN'
    AND NOT grant_access.revoked;
