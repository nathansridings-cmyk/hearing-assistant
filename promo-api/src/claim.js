// One statement claims a single unclaimed row. SQLite (and D1) run that
// write atomically, so two callers cannot receive the same code.
// If this device or this IP already has a row, the UPDATE matches nothing
// and the caller re-reads the earlier code.

const FIND_EXISTING = `
  SELECT code FROM codes
  WHERE device_hash = ? OR ip_hash = ?
  ORDER BY CASE WHEN device_hash = ? THEN 0 ELSE 1 END, id
  LIMIT 1
`;

const CLAIM_ONE = `
  UPDATE codes
  SET claimed_at = ?,
      device_hash = ?,
      ip_hash = ?
  WHERE id = (
    SELECT id FROM codes
    WHERE claimed_at IS NULL
    ORDER BY id
    LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM codes AS taken
    WHERE taken.device_hash = ? OR taken.ip_hash = ?
  )
  RETURNING code
`;

const REMAINING = `SELECT COUNT(*) AS n FROM codes WHERE claimed_at IS NULL`;

async function firstRow(statement) {
  const out = await statement.all();
  const rows = out?.results ?? [];
  return rows[0] ?? null;
}

export async function claimCode(db, { deviceHash, ipHash, now }) {
  const existing = await firstRow(
    db.prepare(FIND_EXISTING).bind(deviceHash, ipHash, deviceHash)
  );
  if (existing?.code) {
    return { ok: true, code: existing.code, repeat: true };
  }

  let claimed = null;
  try {
    claimed = await firstRow(
      db.prepare(CLAIM_ONE).bind(now, deviceHash, ipHash, deviceHash, ipHash)
    );
  } catch (err) {
    // Unique index: a concurrent claim for this device or IP won.
    const message = String(err?.message || err);
    if (!/unique/i.test(message)) throw err;
  }

  if (claimed?.code) {
    return { ok: true, code: claimed.code, repeat: false };
  }

  const again = await firstRow(
    db.prepare(FIND_EXISTING).bind(deviceHash, ipHash, deviceHash)
  );
  if (again?.code) {
    return { ok: true, code: again.code, repeat: true };
  }
  return { ok: false, error: "sold_out" };
}

export async function remainingCount(db) {
  const row = await firstRow(db.prepare(REMAINING).bind());
  return Number(row?.n ?? 0);
}

export async function hashValue(salt, value) {
  const data = new TextEncoder().encode(`hearing-promo-v1\n${salt}\n${value}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
