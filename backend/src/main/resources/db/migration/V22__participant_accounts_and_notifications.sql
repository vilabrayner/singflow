ALTER TABLE singflow.host_accounts DROP CONSTRAINT host_accounts_role_check;
ALTER TABLE singflow.host_accounts ADD CONSTRAINT host_accounts_role_check CHECK (role IN ('HOST','MUSICIAN','PARTICIPANT'));

CREATE TABLE singflow.participant_profiles (
  account_id uuid PRIMARY KEY REFERENCES singflow.host_accounts(account_id),
  whatsapp_phone varchar(16) UNIQUE,
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  push_enabled boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 0,
  CHECK (NOT whatsapp_enabled OR whatsapp_phone IS NOT NULL)
);
CREATE TABLE singflow.participant_account_links (
  session_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES singflow.participant_profiles(account_id),
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id,participant_id),
  UNIQUE (session_id,account_id),
  FOREIGN KEY (session_id,participant_id) REFERENCES singflow.participants(session_id,id)
);
CREATE TABLE singflow.participant_notification_consent (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES singflow.participant_profiles(account_id),
  channel varchar(16) NOT NULL CHECK (channel IN ('whatsapp','webpush')),
  enabled boolean NOT NULL,
  source varchar(32) NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE singflow.whatsapp_link_codes (
  account_id uuid PRIMARY KEY REFERENCES singflow.participant_profiles(account_id),
  code_hash varchar(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE singflow.web_push_subscriptions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES singflow.participant_profiles(account_id),
  endpoint varchar(4096) NOT NULL,
  endpoint_hash varchar(64) NOT NULL UNIQUE,
  p256dh varchar(128) NOT NULL,
  auth varchar(64) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX web_push_account ON singflow.web_push_subscriptions(account_id) WHERE active;
CREATE TABLE singflow.participant_notification_jobs (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES singflow.sessions(id),
  call_id uuid NOT NULL REFERENCES singflow.stage_calls(id),
  account_id uuid NOT NULL REFERENCES singflow.participant_profiles(account_id),
  channel varchar(16) NOT NULL CHECK(channel IN ('whatsapp','webpush')),
  destination_id uuid NOT NULL,
  profile_version bigint NOT NULL,
  state varchar(16) NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','PROCESSING','SENT','FAILED','SKIPPED','UNKNOWN')),
  claim_id uuid,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  lease_until timestamptz,
  provider_message_id varchar(512),
  last_error varchar(64),
  UNIQUE(call_id,channel,destination_id)
);
CREATE INDEX participant_notifications_pending ON singflow.participant_notification_jobs(available_at) WHERE state='PENDING';
