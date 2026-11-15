import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import type { QuoteDocument } from "@/lib/quote-document";
import { renderQuotePdf, safeText } from "./quote-pdf";

const line = (kind: "once_off" | "monthly", name: string, cents: number) => ({
  kind,
  name,
  description: "Fictional description text for a test line item.",
  quantity: 1,
  unit_price_cents: cents,
});

const doc: QuoteDocument = {
  number: "Q-2026-0001",
  status: "sent",
  valid_until: "2026-12-12",
  deposit_percent: 50,
  vat_rate_bps: 0,
  intro: "Thank you for the opportunity.",
  terms: "All prices are in South African Rand.\nDeposit on acceptance.",
  accepted_name: null,
  accepted_at: null,
  client: { company_name: "Example Seafood Co", billing_address: "1 Example Street\nCape Town" },
  business: {
    legal_name: "Example (Pty) Ltd",
    registration_number: "2026/000000/07",
    vat_registered: false,
    vat_number: "",
    address: "",
    email: "hello@example.com",
    phone: "",
  },
  lines: [
    line("once_off", "Design", 500000),
    line("once_off", "Website build (7 pages)", 800000),
    line("monthly", "Hosting and security", 25000),
  ],
};

describe("renderQuotePdf", () => {
  it("produces a valid PDF", async () => {
    const bytes = await renderQuotePdf(doc);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(parsed.getTitle()).toBe("Quotation Q-2026-0001");
  });
  it("paginates a very long quote without throwing", async () => {
    const many = {
      ...doc,
      lines: Array.from({ length: 80 }, (_, i) => line("once_off", `Item ${i + 1}`, 1000 + i)),
      terms: "x ".repeat(3000),
    };
    const parsed = await PDFDocument.load(await renderQuotePdf(many));
    expect(parsed.getPageCount()).toBeGreaterThan(1);
  });
  it("survives characters Helvetica cannot encode, including accepted state", async () => {
    const odd = {
      ...doc,
      intro: "Hello ’world’ — 你好 😀",
      accepted_name: "Zoë Łódź",
      accepted_at: "2026-11-15T10:00:00Z",
    };
    await expect(renderQuotePdf(odd)).resolves.toBeInstanceOf(Uint8Array);
  });
});

describe("safeText", () => {
  it("normalises quotes, dashes and narrow spaces and replaces unsupported characters", () => {
    expect(safeText("R 22 500")).toBe("R 22 500");
    expect(safeText("it’s – ok")).toBe("it's - ok");
    expect(safeText("你")).toBe("?");
  });
});
