import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");

export function openTestDb() {
  const raw = new DatabaseSync(":memory:");
  raw.exec(schema);
  const db = {
    raw,
    prepare(sql) {
      const stmt = raw.prepare(sql);
      return {
        bind(...params) {
          return {
            async all() {
              // Yield once so concurrent claims can pass the read before either writes.
              await Promise.resolve();
              return { results: stmt.all(...params) };
            },
          };
        },
      };
    },
  };
  return db;
}

export function seedFakeCodes(db, count) {
  const insert = db.raw.prepare("INSERT INTO codes (code) VALUES (?)");
  for (let i = 1; i <= count; i++) {
    insert.run(`FAKE-${String(i).padStart(4, "0")}`);
  }
}
