import { describe, expect, it } from "vitest";

import { bundle, onlyFrom, stripTransactionControl } from "../../scripts/bundle-migrations";

describe("onlyFrom (bundle just the new migration for a database that already has the old ones)", () => {
  const files = [
    { name: "20261115000008_lock_down_orders.sql" },
    { name: "20261115000009_quote_discount.sql" },
    { name: "20261115000010_next_thing.sql" },
    { name: "20261115000001_security_hardening.sql" },
  ];
  it("keeps everything when no starting point is given", () => {
    expect(onlyFrom(files)).toHaveLength(4);
  });
  it("keeps only migrations at or after the given id", () => {
    expect(onlyFrom(files, "20261115000009").map((f) => f.name)).toEqual([
      "20261115000009_quote_discount.sql",
      "20261115000010_next_thing.sql",
    ]);
  });
  it("never includes an older migration (re-running one would fail on a live database)", () => {
    const names = onlyFrom(files, "20261115000009").map((f) => f.name);
    expect(names.some((n) => n.startsWith("20261115000008"))).toBe(false);
    expect(names.some((n) => n.startsWith("20261115000001"))).toBe(false);
  });
  it("rejects a starting point that is not digits", () => {
    expect(() => onlyFrom(files, "latest")).toThrow();
    expect(() => onlyFrom(files, "../etc")).toThrow();
  });
});

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
