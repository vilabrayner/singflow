CREATE TABLE singflow.branding_assets (
 id UUID PRIMARY KEY, digest VARCHAR(64) NOT NULL UNIQUE, content BYTEA NOT NULL,
 media_type VARCHAR(30) NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE singflow.branding_entities (
 id UUID PRIMARY KEY, kind VARCHAR(10) NOT NULL CHECK(kind IN ('VENUE','PROJECT')),
 name VARCHAR(120) NOT NULL, logo_id UUID REFERENCES singflow.branding_assets(id),
 background_id UUID REFERENCES singflow.branding_assets(id), instagram VARCHAR(30) NOT NULL DEFAULT '', version BIGINT NOT NULL DEFAULT 1,
 CHECK(kind='VENUE' OR background_id IS NULL)
);
CREATE TABLE singflow.branding_audit (
 id UUID PRIMARY KEY, entity_id UUID NOT NULL REFERENCES singflow.branding_entities(id),
 actor VARCHAR(254) NOT NULL, occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
-- Preserve the previously applied V23 and its legacy presentation fields.
ALTER TABLE singflow.session_tv_settings
 ADD COLUMN venue_id UUID REFERENCES singflow.branding_entities(id),
 ADD COLUMN project_id UUID REFERENCES singflow.branding_entities(id);
-- Old ad-hoc TV setups need an explicit selection of the new shared registrations.
-- Keep all legacy values for review; do not change sessions, participants or requests.
UPDATE singflow.session_tv_settings SET enabled=FALSE,version=version+1 WHERE enabled;
ALTER TABLE singflow.session_tv_settings ADD CONSTRAINT tv_requires_presentation
 CHECK(NOT enabled OR (venue_id IS NOT NULL AND project_id IS NOT NULL));
