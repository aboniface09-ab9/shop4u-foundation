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
