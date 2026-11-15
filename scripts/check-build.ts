/**
 * Pre-deploy safety check. Run AFTER `bun run build` and BEFORE `wrangler deploy`:
 *
 *   bun scripts/check-build.ts --expect-host <production-ref>.supabase.co
 *
 * It fails (exit 1) if:
 *   - dev-only flags (VITE_ENABLE_DEV_ROUTES, VITE_QUOTE_EMAIL_DRY_RUN) are set to "true" in the
 *     environment or in any .env* file that Vite reads,
 *   - the build output mentions any Supabase host other than the expected production one
 *     (e.g. the dev project), or does not mention the expected one at all,
 *   - the build output contains something shaped like a Supabase service-role/secret key.
 * It never prints key material, only host names and file paths.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DEV_FLAGS = ["VITE_ENABLE_DEV_ROUTES", "VITE_QUOTE_EMAIL_DRY_RUN"];

export function findSupabaseHosts(text: string): string[] {
  return [...new Set(text.match(/[a-z0-9]{20}\.supabase\.co/g) ?? [])].sort();
}

/** Parses KEY=VALUE lines (ignores comments, strips quotes). Values are only compared, never printed. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

export function enabledDevFlags(sources: Record<string, string | undefined>[]): string[] {
  return DEV_FLAGS.filter((flag) => sources.some((s) => (s[flag] ?? "").toLowerCase() === "true"));
}

/** Shapes of secret keys that must never be in a client or server bundle. */
export function looksLikeSecretKey(text: string): boolean {
  return (
    /sb_secret_[A-Za-z0-9_-]{20,}/.test(text) ||
    /"role"\s*:\s*"service_role"/.test(text) ||
    hasServiceRoleJwt(text)
  );
}

function hasServiceRoleJwt(text: string): boolean {
  for (const m of text.matchAll(
    /eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{20,})\.[A-Za-z0-9_-]{10,}/g,
  )) {
    try {
      const payload = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8")) as {
        role?: string;
      };
      if (payload.role === "service_role") return true;
    } catch {
      /* not a JWT */
    }
  }
  return false;
}

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(js|mjs|cjs|json|html|css|txt|map)$/.test(name)) yield p;
  }
}

export function checkBuild(opts: {
  distDir: string;
  expectHost: string;
  envSources: Record<string, string | undefined>[];
}): string[] {
  const problems: string[] = [];

  const flags = enabledDevFlags(opts.envSources);
  if (flags.length) problems.push(`Dev-only flag(s) enabled for this build: ${flags.join(", ")}`);

  if (!existsSync(opts.distDir))
    return [...problems, `Build output not found at ${opts.distDir}. Run the build first.`];

  const hosts = new Map<string, string>();
  for (const file of walk(opts.distDir)) {
    const text = readFileSync(file, "utf8");
    for (const h of findSupabaseHosts(text)) if (!hosts.has(h)) hosts.set(h, file);
    if (looksLikeSecretKey(text)) problems.push(`Secret-key-shaped value found in ${file}`);
  }

  for (const [host, file] of hosts) {
    if (host !== opts.expectHost) problems.push(`Unexpected Supabase host ${host} in ${file}`);
  }
  if (!hosts.has(opts.expectHost))
    problems.push(`Expected Supabase host ${opts.expectHost} was not found in the build`);

  return problems;
}

function main() {
  const i = process.argv.indexOf("--expect-host");
  const expectHost = i >= 0 ? process.argv[i + 1] : "";
  if (!/^[a-z0-9]{20}\.supabase\.co$/.test(expectHost ?? "")) {
    console.error("Usage: bun scripts/check-build.ts --expect-host <20-char-ref>.supabase.co");
    process.exit(2);
  }
  const envFiles = [".env", ".env.local", ".env.production", ".env.production.local"]
    .filter((f) => existsSync(f))
    .map((f) => parseEnvFile(readFileSync(f, "utf8")));
  const problems = checkBuild({
    distDir: "dist",
    expectHost,
    envSources: [process.env, ...envFiles],
  });

  if (problems.length) {
    console.error("PRE-DEPLOY CHECK FAILED:");
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(
    `Pre-deploy check passed: build references only ${expectHost}, no dev flags, no secret keys.`,
  );
}

if (import.meta.main) main();
