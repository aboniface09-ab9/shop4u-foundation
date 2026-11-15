/**
 * Builds ONE all-or-nothing SQL script from supabase/migrations/*.sql, for pasting into the
 * Supabase SQL editor. Single source of truth: the migration files are never copied by hand.
 *
 *   bun scripts/bundle-migrations.ts          -> writes supabase/rollout/bundle.sql (git-ignored)
 *
 * Each migration's own BEGIN;/COMMIT; lines are removed and the whole bundle is wrapped in one
 * transaction, so a failure part-way leaves the database exactly as it was.
 * Prints a SHA-256 so you can confirm the file you review is the file you run.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function stripTransactionControl(sql: string): string {
  return sql
    .split(/\r?\n/)
    .filter((line) => !/^\s*(BEGIN|COMMIT)\s*;\s*$/i.test(line))
    .join("\n");
}

export function bundle(files: { name: string; sql: string }[]): string {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  const parts = sorted.map(
    (f) => `-- ===== ${f.name} =====\n${stripTransactionControl(f.sql).trim()}\n`,
  );
  return [
    "-- YouCommerce client dashboard: combined migrations (generated; do not edit).",
    "-- One transaction: if anything fails, nothing is applied.",
    "BEGIN;",
    "",
    ...parts,
    "COMMIT;",
    "",
  ].join("\n");
}

function main() {
  const dir = join("supabase", "migrations");
  const files = readdirSync(dir)
    .filter((n) => /^\d{14}_.+\.sql$/.test(n))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), "utf8") }));
  if (files.length === 0) throw new Error("No migrations found");

  const out = bundle(files);
  mkdirSync(join("supabase", "rollout"), { recursive: true });
  writeFileSync(join("supabase", "rollout", "bundle.sql"), out);
  const hash = createHash("sha256").update(out).digest("hex");
  console.log(
    `Wrote supabase/rollout/bundle.sql (${files.length} migrations, ${out.length} bytes)`,
  );
  console.log(`SHA-256: ${hash}`);
  for (const f of files) console.log("  - " + f.name);
}

if (import.meta.main) main();
