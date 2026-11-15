import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  checkBuild,
  enabledDevFlags,
  findSupabaseHosts,
  looksLikeSecretKey,
  parseEnvFile,
} from "../../scripts/check-build";

const PROD = "aaaaaaaaaaaaaaaaaaaa.supabase.co";
const DEV = "bbbbbbbbbbbbbbbbbbbb.supabase.co";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});
function fakeDist(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "dist-"));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

describe("host detection", () => {
  it("finds supabase hosts and de-duplicates", () => {
    expect(findSupabaseHosts(`a "https://${PROD}/x" b ${PROD} c ${DEV}`)).toEqual([PROD, DEV]);
    expect(findSupabaseHosts("nothing here")).toEqual([]);
  });
});

describe("env flags", () => {
  it("reports dev flags only when set to true, in any source", () => {
    expect(enabledDevFlags([{ VITE_ENABLE_DEV_ROUTES: "true" }, {}])).toEqual([
      "VITE_ENABLE_DEV_ROUTES",
    ]);
    expect(enabledDevFlags([{}, { VITE_QUOTE_EMAIL_DRY_RUN: "TRUE" }])).toEqual([
      "VITE_QUOTE_EMAIL_DRY_RUN",
    ]);
    expect(enabledDevFlags([{ VITE_ENABLE_DEV_ROUTES: "false" }])).toEqual([]);
  });
  it("parses env files, ignoring comments and quotes", () => {
    expect(parseEnvFile('# c\nA=1\nB="two"\n  C = three \n#D=4')).toEqual({
      A: "1",
      B: "two",
      C: "three",
    });
  });
});

describe("secret key detection", () => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const jwt = (role: string) =>
    `eyJhbGciOiJIUzI1NiJ9.${b64({ iss: "supabase", role })}.${"s".repeat(20)}`;
  it("flags service-role JWTs and sb_secret keys, but not anon or publishable keys", () => {
    expect(looksLikeSecretKey(jwt("service_role"))).toBe(true);
    expect(looksLikeSecretKey("sb_secret_" + "x".repeat(24))).toBe(true);
    expect(looksLikeSecretKey(jwt("anon"))).toBe(false);
    expect(looksLikeSecretKey("sb_publishable_" + "x".repeat(24))).toBe(false);
  });
});

describe("checkBuild", () => {
  it("passes a clean build", () => {
    const dist = fakeDist({ "client/app.js": `fetch("https://${PROD}/rest/v1")` });
    expect(checkBuild({ distDir: dist, expectHost: PROD, envSources: [{}] })).toEqual([]);
  });
  it("fails when the dev project leaks into the build", () => {
    const dist = fakeDist({ "client/app.js": `${PROD} ${DEV}` });
    const p = checkBuild({ distDir: dist, expectHost: PROD, envSources: [{}] });
    expect(p.join("\n")).toContain(`Unexpected Supabase host ${DEV}`);
  });
  it("fails when the expected host is missing, a dev flag is on, or a secret is bundled", () => {
    const dist = fakeDist({ "server/w.js": `"role":"service_role" ${DEV}` });
    const p = checkBuild({
      distDir: dist,
      expectHost: PROD,
      envSources: [{ VITE_ENABLE_DEV_ROUTES: "true" }],
    }).join("\n");
    expect(p).toContain("was not found");
    expect(p).toContain("Dev-only flag");
    expect(p).toContain("Secret-key-shaped");
  });
  it("fails clearly when there is no build output", () => {
    expect(
      checkBuild({
        distDir: join(tmpdir(), "no-such-dist-dir"),
        expectHost: PROD,
        envSources: [{}],
      }).join(),
    ).toContain("not found");
  });
});
