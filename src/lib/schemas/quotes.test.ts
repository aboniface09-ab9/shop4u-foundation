import { describe, expect, it } from "vitest";
import {
  businessSettingsSchema,
  priceItemSchema,
  quoteLineSchema,
  quoteSettingsSchema,
} from "./quotes";

describe("priceItemSchema", () => {
  const base = {
    code: "design",
    name: "Design",
    kind: "once_off" as const,
    unit_price_cents: 500000,
  };
  it("uppercases the code and defaults active", () => {
    const r = priceItemSchema.parse(base);
    expect(r.code).toBe("DESIGN");
    expect(r.active).toBe(true);
  });
  it("rejects bad codes, negative or fractional prices, unknown kinds", () => {
    expect(priceItemSchema.safeParse({ ...base, code: "a b" }).success).toBe(false);
    expect(priceItemSchema.safeParse({ ...base, unit_price_cents: -1 }).success).toBe(false);
    expect(priceItemSchema.safeParse({ ...base, unit_price_cents: 10.5 }).success).toBe(false);
    expect(priceItemSchema.safeParse({ ...base, kind: "weekly" }).success).toBe(false);
  });
});

describe("quoteLineSchema", () => {
  it("coerces quantity from a form string and bounds it", () => {
    expect(
      quoteLineSchema.parse({
        kind: "monthly",
        name: "Hosting",
        quantity: "2",
        unit_price_cents: 25000,
      }).quantity,
    ).toBe(2);
    expect(
      quoteLineSchema.safeParse({ kind: "monthly", name: "x", quantity: "0", unit_price_cents: 1 })
        .success,
    ).toBe(false);
    expect(
      quoteLineSchema.safeParse({
        kind: "monthly",
        name: "x",
        quantity: "1.5",
        unit_price_cents: 1,
      }).success,
    ).toBe(false);
  });
});

describe("quoteSettingsSchema", () => {
  it("bounds deposit percent and VAT rate", () => {
    const ok = { valid_until: "2026-12-12", deposit_percent: "50", vat_rate_bps: "0" };
    expect(quoteSettingsSchema.parse(ok).deposit_percent).toBe(50);
    expect(quoteSettingsSchema.safeParse({ ...ok, deposit_percent: "101" }).success).toBe(false);
    expect(quoteSettingsSchema.safeParse({ ...ok, vat_rate_bps: "5000" }).success).toBe(false);
    expect(quoteSettingsSchema.safeParse({ ...ok, valid_until: "soon" }).success).toBe(false);
  });
});

describe("businessSettingsSchema", () => {
  it("requires legal name and validates email and account number", () => {
    const ok = {
      legal_name: "Example (Pty) Ltd",
      default_validity_days: "30",
      default_deposit_percent: "50",
    };
    expect(businessSettingsSchema.safeParse(ok).success).toBe(true);
    expect(businessSettingsSchema.safeParse({ ...ok, legal_name: "" }).success).toBe(false);
    expect(businessSettingsSchema.safeParse({ ...ok, email: "nope" }).success).toBe(false);
    expect(businessSettingsSchema.safeParse({ ...ok, account_number: "12ab" }).success).toBe(false);
  });
});
