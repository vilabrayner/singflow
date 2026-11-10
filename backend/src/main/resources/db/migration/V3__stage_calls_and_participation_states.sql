-- Preserve prior migrations and all existing participants/requests.
ALTER TABLE singflow.participants DROP CONSTRAINT participants_status_check;
ALTER TABLE singflow.participants ADD CONSTRAINT participants_status_check
    CHECK (status IN ('ACTIVE','PAUSED','SUSPENDED','INACTIVE','LEFT'));
ALTER TABLE singflow.participants ADD COLUMN consecutive_absences integer NOT NULL DEFAULT 0 CHECK (consecutive_absences BETWEEN 0 AND 2);
CREATE SEQUENCE singflow.participant_queue_order_seq;
SELECT setval('singflow.participant_queue_order_seq', GREATEST(COALESCE(MAX(check_in_order),0)+1,1),false) FROM singflow.participants;
ALTER TABLE singflow.participants ADD COLUMN queue_order bigint;
UPDATE singflow.participants SET queue_order=check_in_order;
ALTER TABLE singflow.participants ALTER COLUMN queue_order SET NOT NULL;
ALTER TABLE singflow.participants ALTER COLUMN queue_order SET DEFAULT nextval('singflow.participant_queue_order_seq');
ALTER TABLE singflow.participants ADD COLUMN queue_joined_at timestamptz;
UPDATE singflow.participants SET queue_joined_at=checked_in_at;
ALTER TABLE singflow.participants ALTER COLUMN queue_joined_at SET NOT NULL;
CREATE UNIQUE INDEX participants_queue_order_idx ON singflow.participants(queue_order);
ALTER TABLE singflow.song_requests DROP CONSTRAINT song_requests_status_check;
ALTER TABLE singflow.song_requests ADD CONSTRAINT song_requests_status_check
    CHECK (status IN ('PENDING','RESERVED','COMPLETED','SUSPENDED','CANCELLED'));
ALTER TABLE singflow.song_requests ADD CONSTRAINT request_session_identity UNIQUE(session_id,id);
CREATE SEQUENCE singflow.stage_resolution_order_seq;
CREATE TABLE singflow.stage_calls (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES singflow.sessions(id),
    participant_id uuid NOT NULL,
    request_id uuid,
    title varchar(160), artist varchar(160),
    status varchar(12) NOT NULL CHECK (status IN ('CALLED','COMPLETED','ABSENT','DECLINED','CANCELLED','LEFT')),
    created_at timestamptz NOT NULL,
    resolved_at timestamptz,
    resolution_order bigint,
    FOREIGN KEY(session_id,participant_id) REFERENCES singflow.participants(session_id,id),
    FOREIGN KEY(session_id,request_id) REFERENCES singflow.song_requests(session_id,id),
    CHECK ((status='CALLED' AND resolved_at IS NULL AND resolution_order IS NULL)
        OR (status<>'CALLED' AND resolved_at IS NOT NULL AND resolution_order IS NOT NULL)),
    CHECK (status<>'COMPLETED' OR length(trim(title))>0 AND title IS NOT NULL)
);
CREATE UNIQUE INDEX one_active_call_per_session ON singflow.stage_calls(session_id) WHERE status='CALLED';
CREATE INDEX stage_history_idx ON singflow.stage_calls(session_id,created_at);
CREATE TABLE singflow.stage_waits (
    session_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    manual_release boolean NOT NULL,
    PRIMARY KEY(session_id,participant_id),
    FOREIGN KEY(session_id,participant_id) REFERENCES singflow.participants(session_id,id)
);
CREATE TABLE singflow.stage_wait_blockers (
    session_id uuid NOT NULL,
    waiting_id uuid NOT NULL,
    blocker_id uuid NOT NULL,
    PRIMARY KEY(session_id,waiting_id,blocker_id),
    FOREIGN KEY(session_id,waiting_id) REFERENCES singflow.stage_waits(session_id,participant_id) ON DELETE CASCADE,
    FOREIGN KEY(session_id,blocker_id) REFERENCES singflow.participants(session_id,id),
    CHECK(waiting_id<>blocker_id)
);
