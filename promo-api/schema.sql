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

-- One row per device. The same IP may appear on up to MAX_PER_IP rows.
-- NULL hashes (unclaimed rows) are allowed.
CREATE UNIQUE INDEX IF NOT EXISTS codes_device_hash
  ON codes(device_hash) WHERE device_hash IS NOT NULL;

-- Earlier drafts of this schema made the IP index unique. Drop that so a
-- network can hold more than one code. Safe on a brand-new database too.
DROP INDEX IF EXISTS codes_ip_hash;

CREATE INDEX IF NOT EXISTS codes_ip_hash
  ON codes(ip_hash) WHERE ip_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS codes_unclaimed
  ON codes(id) WHERE claimed_at IS NULL;
