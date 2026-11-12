CREATE TABLE singflow.stage_manual_order (
 session_id uuid NOT NULL REFERENCES singflow.sessions(id), participant_id uuid NOT NULL,
 position integer NOT NULL CHECK(position>=0), PRIMARY KEY(session_id,participant_id),
 UNIQUE(session_id,position),
 FOREIGN KEY(session_id,participant_id) REFERENCES singflow.participants(session_id,id)
);
CREATE TABLE singflow.stage_queue_reorders (
 operation_id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES singflow.sessions(id),
 expected_ids uuid[] NOT NULL, ordered_ids uuid[] NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
