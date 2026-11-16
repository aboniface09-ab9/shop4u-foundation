/**
 * Builds ONE all-or-nothing SQL script from supabase/migrations/*.sql, for pasting into the
 * Supabase SQL editor. Single source of truth: the migration files are never copied by hand.
 *
 *   bun scripts/bundle-migrations.ts                       -> ALL migrations (a brand-new database)
 *   bun scripts/bundle-migrations.ts --from 20261115000009 -> only that migration and later ones
 *
 * Production already has 0001 to 0008, so a later release bundles ONLY the new migration(s) with --from;
 * re-running an old one would fail (and, being one transaction, change nothing). Output is written to
 * supabase/rollout/bundle.sql (git-ignored).
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

/** Keeps migrations whose 14-digit id is >= `from` (a full id or a prefix). No `from` keeps them all. */
export function onlyFrom<T extends { name: string }>(files: T[], from?: string): T[] {
  if (!from) return files;
  if (!/^\d{1,14}$/.test(from)) throw new Error("--from must be digits, e.g. 20261115000009");
  return files.filter((f) => f.name.slice(0, 14) >= from.padEnd(14, "0"));
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
  const fromIdx = process.argv.indexOf("--from");
  const from = fromIdx >= 0 ? process.argv[fromIdx + 1] : undefined;
  const files = onlyFrom(
    readdirSync(dir)
      .filter((n) => /^\d{14}_.+\.sql$/.test(n))
      .sort()
      .map((name) => ({ name, sql: readFileSync(join(dir, name), "utf8") })),
    from,
  );
  if (files.length === 0)
    throw new Error("No migrations found" + (from ? " at or after " + from : ""));

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
