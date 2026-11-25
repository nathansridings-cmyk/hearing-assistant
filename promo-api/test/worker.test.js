import { describe, expect, it } from "vitest";
import worker from "../src/index.js";
import { openTestDb, seedFakeCodes } from "./db.js";

const ORIGIN = "https://hearingassistant.app";
const SALT = "test-salt-not-a-secret";

function envFor(db, extra = {}) {
  return { DB: db, HASH_SALT: SALT, MIN_ELAPSED_MS: "1500", ...extra };
}

function uuid(n) {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

function claimRequest({ deviceId, elapsedMs = 2000, ip = "203.0.113.10", origin = ORIGIN, body, headers = {} }) {
  const payload = body === undefined ? JSON.stringify({ deviceId, elapsedMs }) : body;
  return new Request("https://promo.example/claim", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "CF-Connecting-IP": ip,
      ...headers,
    },
    body: payload,
  });
}

describe("worker HTTP", () => {
  it("GET /status returns the remaining count as digits only", async () => {
    const db = openTestDb();
    seedFakeCodes(db, 12);
    const res = await worker.fetch(new Request("https://promo.example/status", {
      headers: { Origin: ORIGIN },
    }), envFor(db));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("12");
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  });

  it("claims each fake code once, including concurrently", async () => {
    const db = openTestDb();
    seedFakeCodes(db, 10);
    const env = envFor(db);

    const results = await Promise.all(
      Array.from({ length: 25 }, async (_, i) => {
        const deviceId = uuid(i + 1);
        const res = await worker.fetch(claimRequest({
          deviceId,
          ip: `203.0.113.${i + 1}`,
        }), env);
        return { deviceId, status: res.status, body: await res.json() };
      })
    );

    const claimed = results.filter((result) => result.status === 200);
    const soldOut = results.filter((result) => result.status === 409);
    const codes = claimed.map((result) => result.body.code);
    expect(new Set(codes).size).toBe(10);
    expect(codes.every((code) => code.startsWith("FAKE-"))).toBe(true);
    expect(soldOut).toHaveLength(15);
    expect(soldOut.every((result) => result.body.error === "sold_out")).toBe(true);

    const status = await worker.fetch(new Request("https://promo.example/status/"), env);
    expect(await status.text()).toBe("0");

    const winner = claimed[0];
    const again = await worker.fetch(claimRequest({
      deviceId: winner.deviceId,
      ip: "198.51.100.8",
    }), env);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ code: winner.body.code, repeat: true });
    expect(await (await worker.fetch(new Request("https://promo.example/status"), env)).text()).toBe("0");
  });

  it("gives a second device on the same IP its own code", async () => {
    const db = openTestDb();
    seedFakeCodes(db, 4);
    const env = envFor(db);
    const first = await worker.fetch(claimRequest({ deviceId: uuid(1), ip: "203.0.113.50" }), env);
    const second = await worker.fetch(claimRequest({ deviceId: uuid(2), ip: "203.0.113.50" }), env);
    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(second.status).toBe(200);
    expect(secondBody.repeat).toBe(false);
    expect(secondBody.code).not.toBe(firstBody.code);
    expect(secondBody.code.startsWith("FAKE-")).toBe(true);
    expect(await (await worker.fetch(new Request("https://promo.example/status"), env)).text()).toBe("2");
  });

  it("allows 5 codes for one IP concurrently, then returns 429 without consuming more", async () => {
    const db = openTestDb();
    seedFakeCodes(db, 20);
    const env = envFor(db);
    const ip = "203.0.113.80";

    const results = await Promise.all(
      Array.from({ length: 10 }, async (_, i) => {
        const deviceId = uuid(i + 1);
        const res = await worker.fetch(claimRequest({ deviceId, ip }), env);
        return { deviceId, status: res.status, body: await res.json() };
      })
    );

    const claimed = results.filter((result) => result.status === 200);
    const limited = results.filter((result) => result.status === 429);
    const codes = claimed.map((result) => result.body.code);
    expect(claimed).toHaveLength(5);
    expect(new Set(codes).size).toBe(5);
    expect(codes.every((code) => code.startsWith("FAKE-"))).toBe(true);
    expect(limited).toHaveLength(5);
    expect(limited.every((result) => result.body.error === "limit")).toBe(true);
    expect(await (await worker.fetch(new Request("https://promo.example/status"), env)).text()).toBe("15");

    const winner = claimed[0];
    const again = await worker.fetch(claimRequest({ deviceId: winner.deviceId, ip }), env);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ code: winner.body.code, repeat: true });

    const extra = await worker.fetch(claimRequest({ deviceId: uuid(90), ip }), env);
    expect(extra.status).toBe(429);
    expect(await extra.json()).toEqual({ error: "limit" });
    expect(await (await worker.fetch(new Request("https://promo.example/status"), env)).text()).toBe("15");

    const elsewhere = await worker.fetch(claimRequest({
      deviceId: uuid(91),
      ip: "203.0.113.81",
    }), env);
    expect(elsewhere.status).toBe(200);
    const elsewhereBody = await elsewhere.json();
    expect(codes).not.toContain(elsewhereBody.code);
    expect(await (await worker.fetch(new Request("https://promo.example/status"), env)).text()).toBe("14");
  });

  it("honors MAX_PER_IP from the environment", async () => {
    const db = openTestDb();
    seedFakeCodes(db, 6);
    const env = envFor(db, { MAX_PER_IP: "2" });
    const ip = "198.51.100.20";
    const first = await worker.fetch(claimRequest({ deviceId: uuid(1), ip }), env);
    const second = await worker.fetch(claimRequest({ deviceId: uuid(2), ip }), env);
    const third = await worker.fetch(claimRequest({ deviceId: uuid(3), ip }), env);
    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstBody.code).not.toBe(secondBody.code);
    expect(third.status).toBe(429);
    expect(await third.json()).toEqual({ error: "limit" });
    expect(await (await worker.fetch(new Request("https://promo.example/status"), env)).text()).toBe("4");
  });

  it("does not store the raw IP", async () => {
    const db = openTestDb();
    seedFakeCodes(db, 1);
    const ip = "203.0.113.77";
    const res = await worker.fetch(claimRequest({ deviceId: uuid(7), ip }), envFor(db));
    expect(res.status).toBe(200);
    const rows = db.raw.prepare("SELECT device_hash, ip_hash, code FROM codes").all();
    const stored = JSON.stringify(rows);
    expect(stored).not.toContain(ip);
    expect(stored).not.toContain(uuid(7));
    expect(stored).toContain("FAKE-0001");
  });

  it("rejects a too-fast claim without using a code", async () => {
    const db = openTestDb();
    seedFakeCodes(db, 3);
    const env = envFor(db);
    const res = await worker.fetch(claimRequest({ deviceId: uuid(3), elapsedMs: 200 }), env);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "too_fast" });
    expect(await (await worker.fetch(new Request("https://promo.example/status"), env)).text()).toBe("3");
  });

  it("allows the hearingassistant.app origin and localhost, and blocks other sites", async () => {
    const db = openTestDb();
    seedFakeCodes(db, 3);
    const env = envFor(db);

    const preflight = await worker.fetch(new Request("https://promo.example/claim", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:8080", "Access-Control-Request-Method": "POST" },
    }), env);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("http://localhost:8080");

    const local = await worker.fetch(claimRequest({
      deviceId: uuid(4),
      origin: "http://127.0.0.1:5500",
      ip: "203.0.113.9",
    }), env);
    expect(local.status).toBe(200);
    expect(local.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5500");

    const evil = await worker.fetch(claimRequest({
      deviceId: uuid(5),
      origin: "https://example.com",
      ip: "203.0.113.19",
    }), env);
    expect(evil.status).toBe(403);
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
    expect(await evil.json()).toEqual({ error: "forbidden" });
    expect(await (await worker.fetch(new Request("https://promo.example/status"), env)).text()).toBe("2");
  });

  it("rejects a bad body, a missing IP, and a missing salt without claiming", async () => {
    const db = openTestDb();
    seedFakeCodes(db, 2);
    const env = envFor(db);

    const badJson = await worker.fetch(claimRequest({ body: "not-json" }), env);
    expect(badJson.status).toBe(400);

    const badDevice = await worker.fetch(claimRequest({ deviceId: "not-a-uuid" }), env);
    expect(badDevice.status).toBe(400);

    const noIp = await worker.fetch(claimRequest({
      deviceId: uuid(8),
      headers: { "CF-Connecting-IP": "" },
    }), env);
    expect(noIp.status).toBe(400);

    const noSalt = await worker.fetch(claimRequest({ deviceId: uuid(8), ip: "203.0.113.21" }), envFor(db, { HASH_SALT: "" }));
    expect(noSalt.status).toBe(503);
    expect(await noSalt.json()).toEqual({ error: "not_configured" });
    expect(await (await worker.fetch(new Request("https://promo.example/status"), env)).text()).toBe("2");
  });

  it("treats the same device id in a different case as the same device", async () => {
    const db = openTestDb();
    seedFakeCodes(db, 2);
    const env = envFor(db);
    const id = "ABCDEFAB-1234-4678-9ABC-ABCDEFABCDEF";
    const first = await worker.fetch(claimRequest({ deviceId: id, ip: "203.0.113.30" }), env);
    const second = await worker.fetch(claimRequest({ deviceId: id.toLowerCase(), ip: "203.0.113.31" }), env);
    expect((await second.json()).code).toBe((await first.json()).code);
    expect(await (await worker.fetch(new Request("https://promo.example/status"), env)).text()).toBe("1");
  });
});
