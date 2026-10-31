-- Additive, privacy-bounded reading/listening analytics.
-- Apply only to the existing read-along-admin-db bound to Pages project read-along-admin.

CREATE TABLE IF NOT EXISTS admin_reading_events (
  event_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  install_hash TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'web')),
  app_version TEXT NOT NULL,
  reading_seconds INTEGER NOT NULL DEFAULT 0 CHECK (reading_seconds BETWEEN 0 AND 120),
  listening_seconds INTEGER NOT NULL DEFAULT 0 CHECK (listening_seconds BETWEEN 0 AND 120),
  book_id TEXT,
  UNIQUE (session_id, sequence)
);
CREATE INDEX IF NOT EXISTS idx_admin_reading_events_received
  ON admin_reading_events(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_reading_events_install_received
  ON admin_reading_events(install_hash, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_reading_events_book_received
  ON admin_reading_events(book_id, received_at DESC);

CREATE TABLE IF NOT EXISTS admin_reading_daily (
  day_utc TEXT PRIMARY KEY,
  reading_seconds INTEGER NOT NULL DEFAULT 0,
  listening_seconds INTEGER NOT NULL DEFAULT 0,
  event_count INTEGER NOT NULL DEFAULT 0,
  session_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS admin_reading_daily_sessions (
  day_utc TEXT NOT NULL,
  session_id TEXT NOT NULL,
  PRIMARY KEY (day_utc, session_id)
);
CREATE INDEX IF NOT EXISTS idx_admin_reading_daily_sessions_day
  ON admin_reading_daily_sessions(day_utc);

CREATE TRIGGER IF NOT EXISTS trg_admin_reading_events_daily
AFTER INSERT ON admin_reading_events
BEGIN
  INSERT INTO admin_reading_daily (day_utc, reading_seconds, listening_seconds, event_count, session_count)
  VALUES (date(NEW.received_at / 1000, 'unixepoch'), NEW.reading_seconds, NEW.listening_seconds, 1, 0)
  ON CONFLICT(day_utc) DO UPDATE SET
    reading_seconds = reading_seconds + excluded.reading_seconds,
    listening_seconds = listening_seconds + excluded.listening_seconds,
    event_count = event_count + 1;

  INSERT OR IGNORE INTO admin_reading_daily_sessions (day_utc, session_id)
  VALUES (date(NEW.received_at / 1000, 'unixepoch'), NEW.session_id);

  UPDATE admin_reading_daily
  SET session_count = (SELECT COUNT(*) FROM admin_reading_daily_sessions WHERE day_utc = date(NEW.received_at / 1000, 'unixepoch'))
  WHERE day_utc = date(NEW.received_at / 1000, 'unixepoch');
END;
