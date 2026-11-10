CREATE TABLE singflow.entry_link_rotations (
 operation_id uuid PRIMARY KEY,
 session_id uuid NOT NULL REFERENCES singflow.sessions(id)
);

CREATE INDEX audience_rate_window_idx ON singflow.audience_rate_limits(window_start);
