ALTER TABLE api_keys ADD COLUMN name TEXT DEFAULT 'Default Key';
ALTER TABLE api_keys ADD COLUMN last_used_at INTEGER;

ALTER TABLE messages ADD COLUMN to_address TEXT DEFAULT '';
ALTER TABLE messages ADD COLUMN from_name TEXT;
ALTER TABLE messages ADD COLUMN html_body TEXT;
ALTER TABLE messages ADD COLUMN text_body TEXT;
ALTER TABLE messages ADD COLUMN provider TEXT;
ALTER TABLE messages ADD COLUMN provider_message_id TEXT;
ALTER TABLE messages ADD COLUMN error_reason TEXT;
ALTER TABLE messages ADD COLUMN retry_count INTEGER DEFAULT 0;
ALTER TABLE messages ADD COLUMN idempotency_key TEXT;
ALTER TABLE messages ADD COLUMN tags TEXT;
ALTER TABLE messages ADD COLUMN metadata TEXT;
ALTER TABLE messages ADD COLUMN delivered_at INTEGER;

CREATE TABLE IF NOT EXISTS domains (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  verification_status TEXT NOT NULL DEFAULT 'pending',
  dkim_status TEXT NOT NULL DEFAULT 'pending',
  spf_status TEXT NOT NULL DEFAULT 'pending',
  dmarc_status TEXT NOT NULL DEFAULT 'pending',
  mx_status TEXT NOT NULL DEFAULT 'pending',
  dns_records TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_attempts (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  provider_response TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE TABLE IF NOT EXISTS suppressions (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  email TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO organisations (id, name, slug, status, created_at)
VALUES ('org_pitacs', 'Pitacs Ltd', 'pitacs', 'active', 1732445829104);

INSERT OR IGNORE INTO projects (id, organisation_id, name, environment, created_at)
VALUES ('proj_pitacs_hub', 'org_pitacs', 'Pitacs Hub', 'production', 1732445829104);

INSERT OR IGNORE INTO domains (id, organisation_id, domain, verification_status, dkim_status, spf_status, dmarc_status, mx_status, created_at)
VALUES ('dom_pitx_uk', 'org_pitacs', 'pitx.uk', 'verified', 'verified', 'verified', 'verified', 'verified', 1732445829104);
