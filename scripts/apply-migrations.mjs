// One-off migration runner over Neon's HTTP driver (robust on flaky networks,
// unlike the websocket path drizzle-kit push uses). Reads every generated .sql
// in ./drizzle, splits on drizzle's statement-breakpoint marker, and runs each
// statement. Safe to re-run: CREATE TABLE / ADD CONSTRAINT already-exists
// errors are treated as no-ops so this doubles as an idempotent apply.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = neon(url);
const dir = "drizzle";
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const ALREADY_EXISTS = /already exists|duplicate/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The network in this environment drops connections intermittently, so retry
// each statement a few times before giving up.
async function run(stmt) {
  let lastErr;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      await sql.query(stmt);
      return;
    } catch (e) {
      const msg = String(e?.message ?? e);
      if (ALREADY_EXISTS.test(msg)) return; // idempotent
      lastErr = e;
      await sleep(attempt * 1500);
    }
  }
  throw lastErr;
}

for (const file of files) {
  const raw = readFileSync(join(dir, file), "utf8");
  const statements = raw
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`\n== ${file} (${statements.length} statements) ==`);
  for (const stmt of statements) {
    const label = stmt.split("\n")[0].slice(0, 60);
    try {
      await run(stmt);
      console.log(`  ok   ${label}`);
    } catch (e) {
      console.error(`  FAIL ${label}\n       ${String(e?.message ?? e)}`);
      process.exit(1);
    }
  }
}

console.log("\nMigrations applied.");
