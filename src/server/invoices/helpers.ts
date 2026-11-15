import type { InvoiceDocument } from "@/lib/invoice-document";
import { escapeHtml } from "../quotes/helpers";

type DbInvoice = Pick<
  InvoiceDocument,
  | "number"
  | "kind"
  | "status"
  | "issue_date"
  | "due_date"
  | "period_start"
  | "vat_rate_bps"
  | "subtotal_cents"
  | "vat_cents"
  | "total_cents"
  | "notes"
  | "paid_on"
>;

/**
 * Builds the client-facing document from admin-read rows. Copies an explicit allow-list of
 * fields so internal ids, tokens and anything else on the rows can never reach a PDF or email.
 */
export function buildInvoiceDocument(
  invoice: DbInvoice,
  lines: InvoiceDocument["lines"],
  client: { company_name: string; billing_address: string | null; vat_number: string | null },
  business: InvoiceDocument["business"] & Partial<NonNullable<InvoiceDocument["bank"]>>,
  bank: InvoiceDocument["bank"],
): InvoiceDocument {
  return {
    number: invoice.number,
    kind: invoice.kind,
    status: invoice.status,
    issue_date: invoice.issue_date,
    due_date: invoice.due_date,
    period_start: invoice.period_start,
    vat_rate_bps: invoice.vat_rate_bps,
    subtotal_cents: invoice.subtotal_cents,
    vat_cents: invoice.vat_cents,
    total_cents: invoice.total_cents,
    notes: invoice.notes,
    paid_on: invoice.paid_on,
    client: {
      company_name: client.company_name,
      billing_address: client.billing_address,
      vat_number: client.vat_number,
    },
    business: {
      legal_name: business.legal_name,
      registration_number: business.registration_number,
      vat_registered: business.vat_registered,
      vat_number: business.vat_number,
      address: business.address,
      email: business.email,
      phone: business.phone,
    },
    bank: bank
      ? {
          bank_name: bank.bank_name,
          account_holder: bank.account_holder,
          account_number: bank.account_number,
          branch_code: bank.branch_code,
        }
      : null,
    lines: lines.map((l) => ({
      name: l.name,
      description: l.description,
      quantity: l.quantity,
      unit_price_cents: l.unit_price_cents,
    })),
  };
}

export function invoiceEmailHtml(opts: {
  clientName: string;
  number: string;
  link: string;
  totalFormatted: string;
  dueFormatted: string;
  senderName: string;
}): string {
  const { clientName, number, link, totalFormatted, dueFormatted, senderName } = opts;
  return [
    `<p>Hello ${escapeHtml(clientName)},</p>`,
    `<p>Please find invoice <strong>${escapeHtml(number)}</strong> from ${escapeHtml(senderName)} for <strong>${escapeHtml(totalFormatted)}</strong>, due ${escapeHtml(dueFormatted)}. A PDF copy is attached.</p>`,
    `<p>You can view it online, with our EFT payment details, here:<br><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`,
    `<p>Please use <strong>${escapeHtml(number)}</strong> as your payment reference. The link is private to you, so please do not forward it.</p>`,
    `<p>Kind regards,<br>${escapeHtml(senderName)}</p>`,
  ].join("\n");
}
