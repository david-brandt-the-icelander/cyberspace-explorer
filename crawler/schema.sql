-- The crawler's database (Cloudflare D1, binding DB), shared with the explorer's Worker, which edits addresses and settings
-- from /admin and asks for rescans. Apply with: npx wrangler d1 execute cyberspace --remote --file crawler/schema.sql -c crawler/wrangler.jsonc

-- Every address the crawler explores: a git repository or a website.
CREATE TABLE IF NOT EXISTS addresses (
  id TEXT PRIMARY KEY,                -- address.js addressId(): kind and normalized URL, hashed
  url TEXT NOT NULL UNIQUE,           -- the normalized URL
  kind TEXT NOT NULL CHECK (kind IN ('git', 'web')),
  label TEXT,                         -- a name to show; the crawler fills it in when empty
  enabled INTEGER NOT NULL DEFAULT 1,
  interval_minutes INTEGER,           -- how often to rescan; NULL takes settings.default_interval_minutes
  max_stale_minutes INTEGER,          -- how old data may be when a player approaches; NULL takes settings.default_max_stale_minutes
  added_at TEXT NOT NULL,
  added_by TEXT,                      -- the GitHub login that added it, or 'crawler' when a cooperating site named it
  found_via TEXT                      -- the address whose /.well-known/cyberspace.json named it
);

-- What the crawler knows about each address's last scan.
CREATE TABLE IF NOT EXISTS scans (
  address_id TEXT PRIMARY KEY REFERENCES addresses(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'new',  -- new, queued, scanning, done, failed
  queued_at TEXT,
  started_at TEXT,
  finished_at TEXT,                    -- last scan that completed
  next_due_at TEXT,                    -- when the schedule rescans it
  source TEXT,                         -- well-known, repository or inferred: where its views come from
  head TEXT,                           -- git: the commit the views were read at
  changed INTEGER NOT NULL DEFAULT 0,  -- files changed by the last scan
  needs_ai INTEGER NOT NULL DEFAULT 0, -- items waiting for the AI step
  error TEXT,
  reason TEXT                          -- schedule, approach, admin
);

-- HTTP cache state per URL the crawler fetched, so a rescan sends conditional requests and skips what is still fresh.
CREATE TABLE IF NOT EXISTS fetches (
  url TEXT PRIMARY KEY,
  status INTEGER,
  etag TEXT,
  last_modified TEXT,
  fresh_until TEXT,                    -- from Cache-Control, Expires or the heuristic of RFC 9111 section 4.2.2
  no_store INTEGER NOT NULL DEFAULT 0,
  body_key TEXT,                       -- where the last body is kept in R2, unless no_store
  body_hash TEXT,                      -- SHA-256 of the last body, to tell a changed body from a re-sent one
  fetched_at TEXT NOT NULL
);

-- Settings the admin page changes.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('default_interval_minutes', '1440'),
  ('default_max_stale_minutes', '10080'),
  ('pages_per_scan', '60'),
  ('ai_enabled', '1');

CREATE INDEX IF NOT EXISTS scans_due ON scans (next_due_at);
