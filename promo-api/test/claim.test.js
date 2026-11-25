import { describe, expect, it } from "vitest";
import { claimCode, hashValue, remainingCount } from "../src/claim.js";
import { openTestDb, seedFakeCodes } from "./db.js";

const SALT = "test-salt-not-a-secret";

function hashes(label) {
  return Promise.all([
    hashValue(SALT, `device:${label}`),
    hashValue(SALT, `ip:${label}`),
  ]);
}

describe("claimCode", () => {
  it("gives each concurrent caller a different fake code and then reports sold out", async () => {
    const db = openTestDb();
    seedFakeCodes(db, 20);

    const results = await Promise.all(
      Array.from({ length: 40 }, async (_, i) => {
        const [deviceHash, ipHash] = await hashes(`person-${i}`);
        return claimCode(db, {
          deviceHash,
          ipHash,
          now: "2026-11-25T00:00:00.000Z",
        });
      })
    );

    const codes = results.filter((result) => result.ok).map((result) => result.code);
    expect(codes).toHaveLength(20);
    expect(new Set(codes).size).toBe(20);
    expect(codes.every((code) => code.startsWith("FAKE-"))).toBe(true);
    expect(results.filter((result) => result.error === "sold_out")).toHaveLength(20);
    expect(await remainingCount(db)).toBe(0);
  });

  it("returns the same code for the same device and does not consume another", async () => {
    const db = openTestDb();
    seedFakeCodes(db, 5);
    const [deviceHash, ipHash] = await hashes("same-phone");
    const first = await claimCode(db, { deviceHash, ipHash, now: "2026-11-25T00:00:00.000Z" });
    const second = await claimCode(db, { deviceHash, ipHash, now: "2026-11-25T00:01:00.000Z" });

    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: true, code: first.code, repeat: true });
    expect(await remainingCount(db)).toBe(4);
  });

  it("returns the same code when only the IP matches, or only the device matches", async () => {
    const db = openTestDb();
    seedFakeCodes(db, 5);
    const [deviceA, ipA] = await hashes("device-a");
    const [deviceB] = await hashes("device-b");
    const [, ipB] = await hashes("ip-b");

    const first = await claimCode(db, { deviceHash: deviceA, ipHash: ipA, now: "t1" });
    const sameIp = await claimCode(db, { deviceHash: deviceB, ipHash: ipA, now: "t2" });
    const sameDevice = await claimCode(db, { deviceHash: deviceA, ipHash: ipB, now: "t3" });

    expect(sameIp).toEqual({ ok: true, code: first.code, repeat: true });
    expect(sameDevice).toEqual({ ok: true, code: first.code, repeat: true });
    expect(await remainingCount(db)).toBe(4);
  });

  it("prefers the device's own code when the device and IP point at different rows", async () => {
    const db = openTestDb();
    seedFakeCodes(db, 2);
    db.raw.prepare(
      "UPDATE codes SET claimed_at = ?, device_hash = ?, ip_hash = ? WHERE code = ?"
    ).run("t", "device-own", "ip-own", "FAKE-0001");
    db.raw.prepare(
      "UPDATE codes SET claimed_at = ?, device_hash = ?, ip_hash = ? WHERE code = ?"
    ).run("t", "device-other", "ip-shared", "FAKE-0002");

    const result = await claimCode(db, {
      deviceHash: "device-own",
      ipHash: "ip-shared",
      now: "t",
    });
    expect(result).toEqual({ ok: true, code: "FAKE-0001", repeat: true });
    expect(await remainingCount(db)).toBe(0);
  });

  it("stores a salted hash, not the raw IP or device id", async () => {
    const ip = "203.0.113.44";
    const device = "11111111-1111-4111-8111-111111111111";
    const ipHash = await hashValue(SALT, `ip:${ip}`);
    const deviceHash = await hashValue(SALT, `device:${device}`);
    const db = openTestDb();
    seedFakeCodes(db, 1);
    await claimCode(db, { deviceHash, ipHash, now: "t" });

    const row = db.raw.prepare("SELECT code, device_hash, ip_hash FROM codes").get();
    expect(row.code).toBe("FAKE-0001");
    expect(row.ip_hash).toBe(ipHash);
    expect(row.ip_hash).not.toContain(ip);
    expect(row.device_hash).not.toContain(device);
    expect(row.ip_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("two concurrent claims for one device receive one code", async () => {
    const db = openTestDb();
    seedFakeCodes(db, 5);
    const [deviceHash, ipHash] = await hashes("race-phone");
    const [a, b] = await Promise.all([
      claimCode(db, { deviceHash, ipHash, now: "t1" }),
      claimCode(db, { deviceHash, ipHash, now: "t2" }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect(a.code).toBe(b.code);
    expect([a.repeat, b.repeat].filter(Boolean)).toHaveLength(1);
    expect(await remainingCount(db)).toBe(4);
  });
});
