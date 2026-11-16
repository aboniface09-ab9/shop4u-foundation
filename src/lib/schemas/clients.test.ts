import { describe, expect, it } from "vitest";
import { clientSchema, contactSchema, projectSchema } from "./clients";

describe("clientSchema", () => {
  it("requires a company name and nulls empty optional fields", () => {
    expect(clientSchema.safeParse({ company_name: "  " }).success).toBe(false);
    const r = clientSchema.parse({ company_name: " Example Seafood Co ", trading_name: "" });
    expect(r.company_name).toBe("Example Seafood Co");
    expect(r.trading_name).toBeNull();
    expect(r.status).toBe("lead");
  });
  it("rejects an unknown status", () => {
    expect(clientSchema.safeParse({ company_name: "X", status: "vip" }).success).toBe(false);
  });
});

describe("contactSchema", () => {
  it("validates email and phone, allows blanks", () => {
    expect(contactSchema.safeParse({ name: "Pat", email: "nope" }).success).toBe(false);
    expect(contactSchema.safeParse({ name: "Pat", phone: "abc" }).success).toBe(false);
    const r = contactSchema.parse({ name: "Pat", email: "", phone: "" });
    expect(r.email).toBeNull();
    expect(r.phone).toBeNull();
    expect(
      contactSchema.parse({ name: "Pat", email: "pat@example.com", phone: "+27 82 000 0000" })
        .is_primary,
    ).toBe(false);
  });
});

describe("projectSchema", () => {
  it("accepts https URLs only", () => {
    expect(
      projectSchema.safeParse({ name: "Site", repo_url: "https://github.com/example/site" })
        .success,
    ).toBe(true);
    for (const bad of [
      "http://example.com",
      "javascript:alert(1)",
      "example.com",
      "//example.com",
    ]) {
      expect(projectSchema.safeParse({ name: "Site", staging_url: bad }).success).toBe(false);
    }
  });
  it("defaults hosting provider to Cloudflare and rejects negative amounts", () => {
    expect(projectSchema.parse({ name: "Site" }).hosting_provider).toBe("Cloudflare");
    expect(projectSchema.safeParse({ name: "Site", hosting_monthly_cents: -1 }).success).toBe(
      false,
    );
  });
  it("rejects malformed dates", () => {
    expect(projectSchema.safeParse({ name: "Site", domain_expiry: "next year" }).success).toBe(
      false,
    );
    expect(projectSchema.parse({ name: "Site", domain_expiry: "2027-08-08" }).domain_expiry).toBe(
      "2027-08-08",
    );
  });
});

// Regression: a phone number copied from WhatsApp or the phone's contacts looked perfect but was rejected,
// because it carried invisible characters. See cleanPasted in clients.ts.
describe("pasted text with invisible characters", () => {
  const LRM = "‎"; // left-to-right mark
  const LRE = "‪"; // left-to-right embedding
  const PDF = "‬"; // pop directional formatting
  const ZWSP = "​"; // zero-width space
  const BOM = "﻿"; // byte-order mark
  const phone = (p: string) => contactSchema.safeParse({ name: "Pat", phone: p });

  it("accepts the exact number that was reported, plain", () => {
    expect(phone("0812867121").success).toBe(true);
  });

  it("accepts and CLEANS numbers wrapped in invisible direction marks", () => {
    const pasted = [
      LRM + "0812867121",
      LRE + "0812867121" + PDF,
      LRM + LRE + "081 286 7121" + PDF + LRM,
      "081" + ZWSP + "2867121",
      BOM + "0812867121",
    ];
    for (const value of pasted) {
      const r = phone(value);
      expect(r.success, JSON.stringify(value)).toBe(true);
      if (r.success) expect(r.data.phone).toMatch(/^[0-9 ]+$/); // nothing invisible is stored
    }
    const spaced = phone(LRM + "081 286 7121");
    expect(spaced.success && spaced.data.phone).toBe("081 286 7121");
  });

  it("converts full-width digits to normal digits", () => {
    const r = phone("０８１２８６７１２１");
    expect(r.success && r.data.phone).toBe("0812867121");
  });

  it("still rejects genuinely bad numbers, with a helpful message", () => {
    for (const bad of ["abc", "081 abc 7121", "12", "0812867121 ext 5", "<script>"]) {
      expect(phone(bad).success, bad).toBe(false);
    }
    const r = phone("nope");
    expect(!r.success && r.error.issues[0].message).toContain("081 286 7121");
  });

  it("cleans emails, names, company names and links the same way", () => {
    const c = contactSchema.parse({
      name: LRM + "Pat Example" + PDF,
      email: LRM + "pat@example.com" + ZWSP,
    });
    expect(c.name).toBe("Pat Example");
    expect(c.email).toBe("pat@example.com");
    expect(
      clientSchema.parse({ company_name: BOM + "Example Seafood Co" + LRM }).company_name,
    ).toBe("Example Seafood Co");
    expect(
      projectSchema.parse({ name: "Site", staging_url: LRM + "https://example.com/x" + ZWSP })
        .staging_url,
    ).toBe("https://example.com/x");
  });

  it("leaves free-text boxes exactly as typed (emoji, typographic quotes, line breaks)", () => {
    const notes = "Café – “quoted” 👨‍👩‍👧\nsecond line";
    const r = clientSchema.parse({ company_name: "X", notes, billing_address: notes });
    expect(r.notes).toBe(notes);
    expect(r.billing_address).toBe(notes);
  });
});
