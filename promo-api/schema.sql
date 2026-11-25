-- Hearing Assistant Google Play giveaway.
-- This file has the table shape only. Real codes are imported from a private
-- CSV that stays outside git. See README.md.

CREATE TABLE IF NOT EXISTS codes (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  claimed_at TEXT,
  device_hash TEXT,
  ip_hash TEXT
);

-- One row per device and one row per IP. NULL hashes (unclaimed rows) are allowed.
CREATE UNIQUE INDEX IF NOT EXISTS codes_device_hash
  ON codes(device_hash) WHERE device_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS codes_ip_hash
  ON codes(ip_hash) WHERE ip_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS codes_unclaimed
  ON codes(id) WHERE claimed_at IS NULL;
