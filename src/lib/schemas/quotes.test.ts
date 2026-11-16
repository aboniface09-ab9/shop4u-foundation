import { describe, expect, it } from "vitest";
import {
  businessSettingsSchema,
  priceItemSchema,
  quoteDiscountSchema,
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
      default_invoice_due_days: "7",
      default_deposit_percent: "50",
    };
    expect(businessSettingsSchema.safeParse(ok).success).toBe(true);
    expect(businessSettingsSchema.safeParse({ ...ok, legal_name: "" }).success).toBe(false);
    expect(businessSettingsSchema.safeParse({ ...ok, email: "nope" }).success).toBe(false);
    expect(businessSettingsSchema.safeParse({ ...ok, account_number: "12ab" }).success).toBe(false);
    expect(
      businessSettingsSchema.safeParse({ ...ok, default_invoice_due_days: "121" }).success,
    ).toBe(false);
  });
});

// Same regression as the phone number: values copied from a banking app, WhatsApp or a document carry
// invisible characters that made strict fields (digits only, email, code) reject a value that looked right.
describe("pasted text with invisible characters (settings and price list)", () => {
  const LRM = "‎";
  const ZWSP = "​";
  const PDF = "‬";
  const base = {
    legal_name: "Example (Pty) Ltd",
    default_validity_days: "30",
    default_deposit_percent: "50",
    default_invoice_due_days: "7",
  };

  it("accepts and cleans a bank account number, email and branch code", () => {
    const r = businessSettingsSchema.safeParse({
      ...base,
      account_number: LRM + "1234 567 890" + PDF,
      email: ZWSP + "hello@example.com" + LRM,
      branch_code: LRM + "123456",
      phone: LRM + "+27 81 286 7121" + PDF,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.account_number).toBe("1234 567 890");
      expect(r.data.email).toBe("hello@example.com");
      expect(r.data.branch_code).toBe("123456");
      expect(r.data.phone).toBe("+27 81 286 7121");
    }
  });

  it("still rejects a genuinely bad account number", () => {
    expect(
      businessSettingsSchema.safeParse({ ...base, account_number: LRM + "12ab" }).success,
    ).toBe(false);
  });

  it("cleans a price list code and a quote date", () => {
    const item = priceItemSchema.parse({
      code: LRM + "design" + ZWSP,
      name: LRM + "Design",
      kind: "once_off",
      unit_price_cents: 500000,
    });
    expect(item.code).toBe("DESIGN");
    expect(item.name).toBe("Design");
    const q = quoteSettingsSchema.parse({
      valid_until: LRM + "2026-12-12" + ZWSP,
      deposit_percent: "50",
      vat_rate_bps: "0",
    });
    expect(q.valid_until).toBe("2026-12-12");
  });

  it("keeps multi-line text as typed (terms keep their line breaks and quotes)", () => {
    const terms = "Line one\n“Quoted” – line two";
    const q = quoteSettingsSchema.parse({
      valid_until: "2026-12-12",
      deposit_percent: "50",
      vat_rate_bps: "0",
      terms,
    });
    expect(q.terms).toBe(terms);
  });
});

describe("quoteDiscountSchema", () => {
  it("blank means no discount, and a whole percentage between 0 and 100 is accepted", () => {
    expect(
      quoteDiscountSchema.parse({ discount_percent: "", discount_label: "" }).discount_percent,
    ).toBe(0);
    expect(quoteDiscountSchema.parse({}).discount_percent).toBe(0);
    expect(quoteDiscountSchema.parse({ discount_percent: "15" }).discount_percent).toBe(15);
    expect(quoteDiscountSchema.parse({ discount_percent: "0" }).discount_percent).toBe(0);
    expect(quoteDiscountSchema.parse({ discount_percent: "100" }).discount_percent).toBe(100);
  });
  it("rejects negatives, over 100, decimals and text", () => {
    for (const bad of ["-1", "101", "15.5", "abc", "10%"]) {
      expect(quoteDiscountSchema.safeParse({ discount_percent: bad }).success, bad).toBe(false);
    }
  });
  it("trims and cleans the label, and caps its length", () => {
    const r = quoteDiscountSchema.parse({
      discount_percent: "10",
      discount_label: "\u200e Referral discount \u200b",
    });
    expect(r.discount_label).toBe("Referral discount");
    expect(quoteDiscountSchema.safeParse({ discount_label: "x".repeat(101) }).success).toBe(false);
  });
  it("is separate from the terms schema, so saving the terms can never reset the discount", () => {
    const terms = quoteSettingsSchema.parse({
      valid_until: "2026-12-12",
      deposit_percent: "50",
      vat_rate_bps: "0",
    });
    expect("discount_percent" in terms).toBe(false);
    expect("discount_label" in terms).toBe(false);
  });
});
