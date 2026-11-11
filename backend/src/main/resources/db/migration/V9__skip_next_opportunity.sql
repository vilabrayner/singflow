CREATE TABLE singflow.stage_queue_skips (
    operation_id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES singflow.sessions(id),
    participant_id uuid NOT NULL,
    expected_request_id uuid,
    next_participant_id uuid NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (session_id, participant_id) REFERENCES singflow.participants(session_id, id),
    FOREIGN KEY (session_id, next_participant_id) REFERENCES singflow.participants(session_id, id),
    CHECK (participant_id <> next_participant_id)
);
CREATE UNIQUE INDEX stage_queue_skip_active_session
    ON singflow.stage_queue_skips(session_id) WHERE active;
