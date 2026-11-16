import { describe, expect, it } from "vitest";

import { buildBrevoPayload } from "../email/brevo";
import {
  buildQuoteDocument,
  bytesToBase64,
  escapeHtml,
  isTokenFormat,
  quoteEmailHtml,
  safeOrigin,
} from "./helpers";

describe("isTokenFormat", () => {
  it("accepts only 64 lowercase hex characters", () => {
    expect(isTokenFormat("a".repeat(64))).toBe(true);
    for (const bad of [
      "",
      "a".repeat(63),
      "a".repeat(65),
      "A".repeat(64),
      "g".repeat(64),
      "../etc/passwd",
      "a".repeat(64) + "\n",
    ]) {
      expect(isTokenFormat(bad)).toBe(false);
    }
  });
});

describe("escapeHtml and email body", () => {
  it("escapes markup so client or business names cannot inject HTML", () => {
    expect(escapeHtml('<img src=x onerror="a()">&')).toBe(
      "&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;",
    );
    const html = quoteEmailHtml({
      clientName: "<b>Evil</b>",
      number: "Q-1",
      link: 'https://portal.example.com/q/abc"onmouseover="x',
      validUntil: "12 December 2026",
      senderName: "Example & Co",
    });
    expect(html).not.toContain("<b>Evil</b>");
    expect(html).not.toContain('"onmouseover');
    expect(html).toContain("Example &amp; Co");
  });
});

describe("bytesToBase64", () => {
  it("round-trips, including larger-than-chunk inputs", () => {
    const small = new TextEncoder().encode("hello");
    expect(bytesToBase64(small)).toBe("aGVsbG8=");
    const big = new Uint8Array(100_000).map((_, i) => i % 251);
    const decoded = Uint8Array.from(atob(bytesToBase64(big)), (c) => c.charCodeAt(0));
    expect(decoded.length).toBe(big.length);
    expect(decoded[99_999]).toBe(big[99_999]);
  });
});

describe("safeOrigin", () => {
  it("uses an https override, otherwise the request origin", () => {
    expect(safeOrigin("https://portal.example.com/ignored/path", "https://x.example.org/api")).toBe(
      "https://portal.example.com",
    );
    expect(safeOrigin("http://insecure.example.com", "https://x.example.org/api")).toBe(
      "https://x.example.org",
    );
    expect(safeOrigin("javascript:alert(1)", "https://x.example.org/api")).toBe(
      "https://x.example.org",
    );
    expect(safeOrigin(undefined, "https://x.example.org/api")).toBe("https://x.example.org");
  });
});

describe("buildBrevoPayload", () => {
  const env = { BREVO_API_KEY: "k", BREVO_SENDER_EMAIL: "hello@example.com" };
  const base = { to: { email: "client@example.com" }, subject: "S", htmlContent: "<p>x</p>" };
  it("omits attachment when there is none", () => {
    expect(buildBrevoPayload(env, base)).not.toHaveProperty("attachment");
  });
  it("maps attachments to Brevo's name/content shape", () => {
    const p = buildBrevoPayload(env, {
      ...base,
      attachments: [{ name: "q.pdf", contentBase64: "QUJD" }],
    });
    expect(p.attachment).toEqual([{ name: "q.pdf", content: "QUJD" }]);
    expect(p.sender.name).toBe("YouCommerce");
  });
});

describe("buildQuoteDocument", () => {
  it("copies only the fields the client may see", () => {
    const doc = buildQuoteDocument(
      {
        number: "Q-1",
        status: "draft",
        valid_until: "2026-12-12",
        deposit_percent: 50,
        vat_rate_bps: 0,
        discount_percent: 0,
        discount_label: "",
        intro: "",
        terms: "",
        accepted_name: null,
        accepted_at: null,
      },
      [
        {
          kind: "once_off",
          name: "Design",
          description: "",
          quantity: 1,
          unit_price_cents: 500000,
          ...({ id: "secret-line-id" } as object),
        } as never,
      ],
      { company_name: "Example Co", billing_address: null },
      {
        legal_name: "Biz",
        registration_number: "",
        vat_registered: false,
        vat_number: "",
        address: "",
        email: "",
        phone: "",
        ...({ account_number: "123456" } as object),
      } as never,
    );
    expect(doc.discount_percent).toBe(0);
    expect(doc.discount_label).toBe("");
    expect(JSON.stringify(doc)).not.toContain("secret-line-id");
    expect(JSON.stringify(doc)).not.toContain("123456");
    expect(doc.lines[0].unit_price_cents).toBe(500000);
  });
});
