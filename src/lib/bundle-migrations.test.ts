import { describe, expect, it } from "vitest";

import { bundle, stripTransactionControl } from "../../scripts/bundle-migrations";

describe("stripTransactionControl", () => {
  it("removes standalone BEGIN/COMMIT lines only", () => {
    const sql =
      "BEGIN;\nCREATE TABLE t (a int);\n  commit ;\n-- BEGIN; in a comment is kept as a comment\nSELECT 'COMMIT;';\nCOMMIT;";
    const out = stripTransactionControl(sql);
    expect(out).not.toMatch(/^\s*BEGIN\s*;\s*$/im);
    expect(out).not.toMatch(/^\s*COMMIT\s*;\s*$/im);
    expect(out).toContain("CREATE TABLE t (a int);");
    expect(out).toContain("-- BEGIN; in a comment is kept as a comment");
    expect(out).toContain("SELECT 'COMMIT;';");
  });
});

describe("bundle", () => {
  const files = [
    { name: "20261115000002_b.sql", sql: "CREATE TABLE b (a int);" },
    { name: "20261115000001_a.sql", sql: "BEGIN;\nCREATE TABLE a (a int);\nCOMMIT;" },
  ];
  it("orders by filename and wraps everything in a single transaction", () => {
    const out = bundle(files);
    expect(out.indexOf("CREATE TABLE a")).toBeLessThan(out.indexOf("CREATE TABLE b"));
    expect(out.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(out.match(/^COMMIT;$/gm)).toHaveLength(1);
    expect(out.trim().endsWith("COMMIT;")).toBe(true);
  });
  it("labels each migration so a reviewer can find it", () => {
    const out = bundle(files);
    expect(out).toContain("-- ===== 20261115000001_a.sql =====");
    expect(out).toContain("-- ===== 20261115000002_b.sql =====");
  });
});
