CREATE TABLE IF NOT EXISTS organisations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL DEFAULT 'emails:send,emails:read',
  expires_at INTEGER,
  revoked_at INTEGER,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS domains (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  domain TEXT NOT NULL UNIQUE,
  verification_status TEXT NOT NULL DEFAULT 'pending',
  dkim_status TEXT NOT NULL DEFAULT 'pending',
  spf_status TEXT NOT NULL DEFAULT 'pending',
  dmarc_status TEXT NOT NULL DEFAULT 'pending',
  mx_status TEXT NOT NULL DEFAULT 'pending',
  dns_records TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_address TEXT NOT NULL,
  from_name TEXT,
  to_address TEXT NOT NULL,
  cc_address TEXT,
  bcc_address TEXT,
  reply_to TEXT,
  subject TEXT NOT NULL,
  html_body TEXT,
  text_body TEXT,
  status TEXT NOT NULL DEFAULT 'accepted',
  provider TEXT,
  provider_message_id TEXT,
  error_reason TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT,
  tags TEXT,
  metadata TEXT,
  scheduled_at INTEGER,
  delivered_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_attempts (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
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
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (project_id, key_hash)
);

-- Seed default Pitacs tenant and default API key into remote Cloudflare D1
INSERT OR IGNORE INTO organisations (id, name, slug, status, created_at)
VALUES ('org_pitacs', 'Pitacs Ltd', 'pitacs', 'active', 1732445829104);

INSERT OR IGNORE INTO projects (id, organisation_id, name, environment, created_at)
VALUES ('proj_pitacs_hub', 'org_pitacs', 'Pitacs Hub', 'production', 1732445829104);

INSERT OR IGNORE INTO api_keys (id, organisation_id, project_id, name, key_prefix, key_hash, scopes, created_at)
VALUES (
  'key_default_hub',
  'org_pitacs',
  'proj_pitacs_hub',
  'Default Pitacs Hub Key',
  'pm_live_def...',
  '71997f1c700ef4c931ef9cc477094f68596f9fcbab2a9702419cec1e443c2e36',
  'emails:send,emails:read',
  1732445829104
);

INSERT OR IGNORE INTO domains (id, organisation_id, domain, verification_status, dkim_status, spf_status, dmarc_status, mx_status, created_at)
VALUES ('dom_pitx_uk', 'org_pitacs', 'pitx.uk', 'pending', 'pending', 'pending', 'pending', 'pending', 1732445829104);
