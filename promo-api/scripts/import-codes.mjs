import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { sep, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CODE_RE = /^[A-Za-z0-9-]{4,40}$/;
const promoRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = resolve(promoRoot, "..");

function stripQuotes(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function parsePromoCsv(text) {
  const lines = String(text).replace(/^\uFEFF/, "").split(/\r?\n/);
  let start = 0;
  while (start < lines.length && lines[start].trim() === "") start += 1;
  if (start >= lines.length) {
    throw new Error("CSV is empty. The first row must be: Promotion code");
  }
  const header = stripQuotes(lines[start]);
  if (header !== "Promotion code") {
    throw new Error("CSV header must be exactly: Promotion code");
  }

  const codes = [];
  const seen = new Set();
  let skippedDuplicates = 0;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    if (lines[i].includes(",")) {
      throw new Error(`Line ${i + 1} has more than one column. Use a single column named Promotion code.`);
    }
    const code = stripQuotes(lines[i]);
    if (!CODE_RE.test(code)) {
      throw new Error(`Invalid code format on line ${i + 1}. Use 4 to 40 letters, numbers, or hyphens.`);
    }
    if (seen.has(code)) {
      skippedDuplicates += 1;
      continue;
    }
    seen.add(code);
    codes.push(code);
  }
  if (codes.length === 0) throw new Error("CSV has no codes under the header.");
  return { codes, skippedDuplicates };
}

export function codesToSql(codes) {
  const chunks = [];
  const size = 80;
  for (let i = 0; i < codes.length; i += size) {
    const values = codes.slice(i, i + size).map((code) => `('${code}')`).join(",\n");
    chunks.push(`INSERT INTO codes (code) VALUES\n${values}\nON CONFLICT(code) DO NOTHING;`);
  }
  return `${chunks.join("\n\n")}\n`;
}

export function assertCsvOutsideRepo(csvPath, root = repoRoot) {
  const abs = resolve(csvPath);
  const base = resolve(root);
  if (abs === base || abs.startsWith(base + sep)) {
    throw new Error("Refusing to read a CSV inside the public repository. Keep the file outside this repo.");
  }
  return abs;
}

function shred(file) {
  try {
    const size = statSync(file).size;
    writeFileSync(file, Buffer.alloc(Math.max(size, 1)));
    rmSync(file, { force: true });
  } catch {
    try {
      rmSync(file, { force: true });
    } catch {
      /* already gone */
    }
  }
}

function runWrangler(args) {
  const result = spawnSync("npx", ["wrangler", ...args], {
    cwd: promoRoot,
    stdio: "inherit",
  });
  if (result.error) throw new Error(result.error.message);
  if (result.status !== 0) {
    throw new Error(`wrangler exited with status ${result.status ?? "unknown"}`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const remote = args.includes("--remote");
  const dryRun = args.includes("--dry-run");
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const csvArg = positional[0];
  if (!csvArg || args.includes("--help") || args.includes("-h")) {
    console.log("Usage: node scripts/import-codes.mjs [--remote] [--dry-run] <csv-path>");
    console.log("The CSV must stay outside this public repo. Header: Promotion code");
    process.exit(csvArg ? 0 : 1);
  }
  if (positional.length !== 1) {
    throw new Error("Pass one CSV path.");
  }

  const csvPath = assertCsvOutsideRepo(csvArg);
  const { codes, skippedDuplicates } = parsePromoCsv(readFileSync(csvPath, "utf8"));
  console.log(`Parsed ${codes.length} codes. Skipped ${skippedDuplicates} duplicates.`);
  if (dryRun) {
    console.log("Dry run only. Nothing was loaded.");
    return;
  }

  const where = remote ? "--remote" : "--local";
  const dir = mkdtempSync(resolve(tmpdir(), "hearing-promo-"));
  const sqlFile = resolve(dir, "load.sql");
  try {
    writeFileSync(sqlFile, codesToSql(codes), { mode: 0o600 });
    runWrangler(["d1", "execute", "hearing-promo", where, "--file=schema.sql"]);
    runWrangler(["d1", "execute", "hearing-promo", where, `--file=${sqlFile}`]);
  } finally {
    shred(sqlFile);
    rmSync(dir, { recursive: true, force: true });
  }

  console.log("Import finished. Asking D1 for counts only (not codes).");
  runWrangler([
    "d1",
    "execute",
    "hearing-promo",
    where,
    "--command",
    "SELECT COUNT(*) AS total, SUM(CASE WHEN claimed_at IS NULL THEN 1 ELSE 0 END) AS remaining FROM codes;",
  ]);
}

const invokedDirectly =
  process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  try {
    main();
  } catch (err) {
    console.error(err.message || String(err));
    process.exit(1);
  }
}
