/** The shape returned by the get_invoice_by_token database function (what the client may see). */
export type InvoiceDocument = {
  number: string;
  kind: "deposit" | "balance" | "monthly";
  status: "draft" | "sent" | "paid" | "void";
  issue_date: string;
  due_date: string;
  period_start: string | null;
  vat_rate_bps: number;
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
  notes: string;
  paid_on: string | null;
  client: { company_name: string; billing_address: string | null; vat_number: string | null };
  business: {
    legal_name: string;
    registration_number: string;
    vat_registered: boolean;
    vat_number: string;
    address: string;
    email: string;
    phone: string;
  };
  /** EFT details. Present only while the invoice is awaiting payment. */
  bank: {
    bank_name: string;
    account_holder: string;
    account_number: string;
    branch_code: string;
  } | null;
  lines: { name: string; description: string; quantity: number; unit_price_cents: number }[];
};

export const INVOICE_KIND_TITLE: Record<InvoiceDocument["kind"], string> = {
  deposit: "Deposit invoice",
  balance: "Balance invoice",
  monthly: "Monthly hosting and maintenance",
};

/** A VAT-registered business issuing an invoice with VAT must call it a tax invoice. */
export const invoiceHeading = (doc: Pick<InvoiceDocument, "business" | "vat_cents">) =>
  doc.business.vat_registered && doc.vat_cents > 0 ? "TAX INVOICE" : "INVOICE";
