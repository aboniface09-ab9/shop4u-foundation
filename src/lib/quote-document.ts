import type { MoneyLine } from "./money";

/** The shape returned by the get_quote_by_token database function (what the client may see). */
export type QuoteDocument = {
  number: string;
  status: "draft" | "sent" | "viewed" | "accepted" | "declined" | "expired";
  valid_until: string;
  deposit_percent: number;
  vat_rate_bps: number;
  discount_percent: number;
  discount_label: string;
  intro: string;
  terms: string;
  accepted_name: string | null;
  accepted_at: string | null;
  client: { company_name: string; billing_address: string | null };
  business: {
    legal_name: string;
    registration_number: string;
    vat_registered: boolean;
    vat_number: string;
    address: string;
    email: string;
    phone: string;
  };
  lines: (MoneyLine & { name: string; description: string })[];
};
