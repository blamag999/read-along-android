-- Run once against the dedicated read-along-admin-db D1 database.
-- This database is not shared with Private Comic Reader.
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS admin_auth_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash TEXT NOT NULL,
  attempted_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_auth_attempts_ip_time
  ON admin_auth_attempts(ip_hash, attempted_at);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  object_key TEXT,
  detail_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created
  ON admin_audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS admin_totp_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_counter INTEGER NOT NULL
);
INSERT OR IGNORE INTO admin_totp_state (id, last_counter) VALUES (1, -1);

-- Incremental diagnostics cache and operational debug history (Admin D1 only).
CREATE TABLE IF NOT EXISTS admin_scan_cache (
  object_key TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  findings_json TEXT NOT NULL,
  scanned_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_scan_cache_scanned ON admin_scan_cache(scanned_at);

CREATE TABLE IF NOT EXISTS admin_scan_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id TEXT NOT NULL,
  prefix TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  scanned INTEGER NOT NULL DEFAULT 0,
  changed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  warnings INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  rule_version TEXT,
  ray_id TEXT,
  error_message TEXT,
  detail_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_scan_logs_created ON admin_scan_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_scan_logs_scan_id ON admin_scan_logs(scan_id);


-- Persistent library pagination requests and browser diagnostic events (Admin D1 only).
CREATE TABLE IF NOT EXISTS admin_library_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  prefix TEXT NOT NULL DEFAULT '',
  page_size INTEGER NOT NULL DEFAULT 25,
  cursor_present INTEGER NOT NULL DEFAULT 0,
  folders_count INTEGER NOT NULL DEFAULT 0,
  files_count INTEGER NOT NULL DEFAULT 0,
  truncated INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  ray_id TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_library_requests_created ON admin_library_requests(created_at DESC);
CREATE TABLE IF NOT EXISTS admin_client_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  ray_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_client_events_created ON admin_client_events(created_at DESC);


-- Anonymous app usage. Store only hashes of random installation/launch identifiers.
CREATE TABLE IF NOT EXISTS admin_app_installations (
  install_hash TEXT PRIMARY KEY, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL,
  platform TEXT NOT NULL DEFAULT 'other', app_version TEXT NOT NULL DEFAULT 'unknown'
);
CREATE INDEX IF NOT EXISTS idx_admin_app_installations_last_seen ON admin_app_installations(last_seen DESC);
CREATE TABLE IF NOT EXISTS admin_app_visits (
  launch_hash TEXT PRIMARY KEY, install_hash TEXT NOT NULL, platform TEXT NOT NULL DEFAULT 'other',
  app_version TEXT NOT NULL DEFAULT 'unknown', visited_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_app_visits_visited_at ON admin_app_visits(visited_at DESC);
CREATE TABLE IF NOT EXISTS admin_app_totals (
  id INTEGER PRIMARY KEY CHECK (id = 1), total_visits INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO admin_app_totals (id, total_visits) VALUES (1, 0);
CREATE TABLE IF NOT EXISTS admin_server_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT, route TEXT NOT NULL, message TEXT NOT NULL, ray_id TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_server_errors_created ON admin_server_errors(created_at DESC);


-- Platform-specific aggregate counters; dashboard uses Android installs only.
CREATE TABLE IF NOT EXISTS admin_app_platform_totals (
  platform TEXT PRIMARY KEY,
  total_visits INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO admin_app_platform_totals (platform, total_visits)
VALUES ('android', 0), ('ios', 0), ('web', 0), ('other', 0);
