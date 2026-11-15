import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { invoiceHeading, type InvoiceDocument } from "@/lib/invoice-document";
import { renderInvoicePdf } from "./invoice-pdf";

const base: InvoiceDocument = {
  number: "INV-2026-0001",
  kind: "deposit",
  status: "sent",
  issue_date: "2026-11-15",
  due_date: "2026-11-22",
  period_start: null,
  vat_rate_bps: 0,
  subtotal_cents: 1125000,
  vat_cents: 0,
  total_cents: 1125000,
  notes: "",
  paid_on: null,
  client: {
    company_name: "Example Seafood Co",
    billing_address: "1 Example Street\nCape Town",
    vat_number: null,
  },
  business: {
    legal_name: "Example (Pty) Ltd",
    registration_number: "2026/000000/07",
    vat_registered: false,
    vat_number: "",
    address: "1 Business Road\nCape Town",
    email: "hello@example.com",
    phone: "",
  },
  bank: {
    bank_name: "Example Bank",
    account_holder: "Example (Pty) Ltd",
    account_number: "0000000000",
    branch_code: "000000",
  },
  lines: [
    {
      name: "Deposit (50% of once-off build)",
      description: "Quotation Q-2026-0001",
      quantity: 1,
      unit_price_cents: 1125000,
    },
  ],
};

describe("renderInvoicePdf", () => {
  it("produces a valid PDF for each status", async () => {
    for (const status of ["draft", "sent", "paid", "void"] as const) {
      const doc: InvoiceDocument = {
        ...base,
        status,
        bank: status === "sent" ? base.bank : null,
        paid_on: status === "paid" ? "2026-11-16" : null,
      };
      const bytes = await renderInvoicePdf(doc);
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
      const parsed = await PDFDocument.load(bytes);
      expect(parsed.getTitle()).toBe("Invoice INV-2026-0001");
    }
  });
  it("handles a monthly invoice with VAT, many lines and odd characters", async () => {
    const doc: InvoiceDocument = {
      ...base,
      kind: "monthly",
      period_start: "2026-12-15",
      vat_rate_bps: 1500,
      subtotal_cents: 75000,
      vat_cents: 11250,
      total_cents: 86250,
      notes: "Thanks ’all’ 你好",
      lines: Array.from({ length: 60 }, (_, i) => ({
        name: `Service ${i}`,
        description: "x ".repeat(80),
        quantity: 1,
        unit_price_cents: 1250,
      })),
    };
    const parsed = await PDFDocument.load(await renderInvoicePdf(doc));
    expect(parsed.getPageCount()).toBeGreaterThan(1);
  });
});

describe("invoiceHeading", () => {
  it("is a TAX INVOICE only for a VAT-registered business charging VAT", () => {
    expect(
      invoiceHeading({ business: { ...base.business, vat_registered: true }, vat_cents: 100 }),
    ).toBe("TAX INVOICE");
    expect(
      invoiceHeading({ business: { ...base.business, vat_registered: true }, vat_cents: 0 }),
    ).toBe("INVOICE");
    expect(invoiceHeading({ business: base.business, vat_cents: 100 })).toBe("INVOICE");
  });
});
