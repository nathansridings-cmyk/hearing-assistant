// One statement claims a single unclaimed row. SQLite (and D1) run that
// write atomically, so two callers cannot receive the same code.
// The same device always gets the code it already holds. One IP may hold
// up to maxPerIp different codes (one per device). Past that, nothing is written.

const FIND_DEVICE = `
  SELECT code FROM codes
  WHERE device_hash = ?
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
    WHERE taken.device_hash = ?
  )
  AND (
    SELECT COUNT(*) FROM codes AS ip_rows
    WHERE ip_rows.ip_hash = ?
  ) < ?
  RETURNING code
`;

const IP_COUNT = `SELECT COUNT(*) AS n FROM codes WHERE ip_hash = ?`;
const REMAINING = `SELECT COUNT(*) AS n FROM codes WHERE claimed_at IS NULL`;

async function firstRow(statement) {
  const out = await statement.all();
  const rows = out?.results ?? [];
  return rows[0] ?? null;
}

function normalizeLimit(maxPerIp) {
  const n = Number(maxPerIp);
  if (!Number.isFinite(n) || n < 1) return 5;
  return Math.floor(n);
}

export async function claimCode(db, { deviceHash, ipHash, now, maxPerIp = 5 }) {
  const limit = normalizeLimit(maxPerIp);
  const existing = await firstRow(db.prepare(FIND_DEVICE).bind(deviceHash));
  if (existing?.code) {
    return { ok: true, code: existing.code, repeat: true };
  }

  let claimed = null;
  try {
    claimed = await firstRow(
      db.prepare(CLAIM_ONE).bind(now, deviceHash, ipHash, deviceHash, ipHash, limit)
    );
  } catch (err) {
    // Unique index: a concurrent claim for this device won the row.
    const message = String(err?.message || err);
    if (!/unique/i.test(message)) throw err;
  }

  if (claimed?.code) {
    return { ok: true, code: claimed.code, repeat: false };
  }

  const again = await firstRow(db.prepare(FIND_DEVICE).bind(deviceHash));
  if (again?.code) {
    return { ok: true, code: again.code, repeat: true };
  }

  const left = await remainingCount(db);
  if (left === 0) return { ok: false, error: "sold_out" };

  const used = await firstRow(db.prepare(IP_COUNT).bind(ipHash));
  if (Number(used?.n ?? 0) >= limit) return { ok: false, error: "limit" };
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
