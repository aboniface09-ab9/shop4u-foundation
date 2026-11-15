import { describe, expect, it } from "vitest";

import { buildInvoiceDocument, invoiceEmailHtml } from "./helpers";

const invoice = {
  number: "INV-2026-0001",
  kind: "deposit" as const,
  status: "sent" as const,
  issue_date: "2026-11-15",
  due_date: "2026-11-22",
  period_start: null,
  vat_rate_bps: 0,
  subtotal_cents: 1000,
  vat_cents: 0,
  total_cents: 1000,
  notes: "",
  paid_on: null,
};
const business = {
  legal_name: "Biz",
  registration_number: "",
  vat_registered: false,
  vat_number: "",
  address: "",
  email: "",
  phone: "",
};

describe("buildInvoiceDocument", () => {
  it("copies only an allow-list: no ids, token hashes or extra columns leak", () => {
    const doc = buildInvoiceDocument(
      {
        ...invoice,
        ...({
          id: "secret-id",
          token_hash: "secret-hash",
          sent_to_email: "x@example.com",
        } as object),
      } as never,
      [
        {
          name: "Deposit",
          description: "",
          quantity: 1,
          unit_price_cents: 1000,
          ...({ id: "line-secret" } as object),
        } as never,
      ],
      {
        company_name: "Example Co",
        billing_address: null,
        vat_number: null,
        ...({ id: "client-secret" } as object),
      } as never,
      {
        ...business,
        ...({ default_terms: "internal-terms", account_number: "BIZ-LEAK" } as object),
      } as never,
      {
        bank_name: "B",
        account_holder: "H",
        account_number: "123",
        branch_code: "456",
        ...({ extra: "bank-extra" } as object),
      } as never,
    );
    const json = JSON.stringify(doc);
    for (const secret of [
      "secret-id",
      "secret-hash",
      "x@example.com",
      "line-secret",
      "client-secret",
      "internal-terms",
      "BIZ-LEAK",
      "bank-extra",
    ]) {
      expect(json).not.toContain(secret);
    }
    expect(doc.bank?.account_number).toBe("123");
  });
  it("can build a bank-less document", () => {
    expect(
      buildInvoiceDocument(
        invoice,
        [],
        { company_name: "C", billing_address: null, vat_number: null },
        business,
        null,
      ).bank,
    ).toBeNull();
  });
});

describe("invoiceEmailHtml", () => {
  it("escapes every interpolated value", () => {
    const html = invoiceEmailHtml({
      clientName: "<script>alert(1)</script>",
      number: "INV-1",
      link: 'https://portal.example.com/i/abc"onclick="x',
      totalFormatted: "R 1 000,00",
      dueFormatted: "22 November 2026",
      senderName: "A & B",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('"onclick');
    expect(html).toContain("A &amp; B");
    expect(html).toContain("INV-1");
  });
});
