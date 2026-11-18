CREATE TABLE singflow.session_tv_settings (
 session_id UUID PRIMARY KEY REFERENCES singflow.sessions(id),
 enabled BOOLEAN NOT NULL DEFAULT FALSE,
 venue_name VARCHAR(120) NOT NULL DEFAULT '',
 venue_logo VARCHAR(300) NOT NULL DEFAULT '',
 brand_logo VARCHAR(300) NOT NULL DEFAULT '',
 version BIGINT NOT NULL DEFAULT 0
);
