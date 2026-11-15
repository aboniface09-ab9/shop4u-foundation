import type { QuoteDocument } from "@/lib/quote-document";

/** 64 lowercase hex characters = a 256-bit token. Anything else is rejected before touching the database. */
export const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
export const isTokenFormat = (s: string) => TOKEN_PATTERN.test(s);

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Base64 of raw bytes without blowing the call stack on larger files. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Only https origins are accepted for building client links (no javascript:, no http:). */
export function safeOrigin(candidate: string | undefined, fallbackUrl: string): string {
  if (candidate) {
    try {
      const u = new URL(candidate);
      if (u.protocol === "https:") return u.origin;
    } catch {
      /* fall through */
    }
  }
  return new URL(fallbackUrl).origin;
}

type DbQuote = {
  number: string;
  status: QuoteDocument["status"];
  valid_until: string;
  deposit_percent: number;
  vat_rate_bps: number;
  intro: string;
  terms: string;
  accepted_name: string | null;
  accepted_at: string | null;
};
type DbLine = QuoteDocument["lines"][number];
type DbBusiness = QuoteDocument["business"];

/** Builds the same document the client sees, from admin-read rows (used when sending, before any view). */
export function buildQuoteDocument(
  quote: DbQuote,
  lines: DbLine[],
  client: { company_name: string; billing_address: string | null },
  business: DbBusiness,
): QuoteDocument {
  return {
    number: quote.number,
    status: quote.status,
    valid_until: quote.valid_until,
    deposit_percent: quote.deposit_percent,
    vat_rate_bps: quote.vat_rate_bps,
    intro: quote.intro,
    terms: quote.terms,
    accepted_name: quote.accepted_name,
    accepted_at: quote.accepted_at,
    client: { company_name: client.company_name, billing_address: client.billing_address },
    business: {
      legal_name: business.legal_name,
      registration_number: business.registration_number,
      vat_registered: business.vat_registered,
      vat_number: business.vat_number,
      address: business.address,
      email: business.email,
      phone: business.phone,
    },
    lines: lines.map((l) => ({
      kind: l.kind,
      name: l.name,
      description: l.description,
      quantity: l.quantity,
      unit_price_cents: l.unit_price_cents,
    })),
  };
}

export function quoteEmailHtml(opts: {
  clientName: string;
  number: string;
  link: string;
  validUntil: string;
  senderName: string;
}): string {
  const { clientName, number, link, validUntil, senderName } = opts;
  return [
    `<p>Hello ${escapeHtml(clientName)},</p>`,
    `<p>Please find your quotation <strong>${escapeHtml(number)}</strong> from ${escapeHtml(senderName)}. A PDF copy is attached.</p>`,
    `<p>You can view it online and accept it here:<br><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`,
    `<p>This quotation is valid until ${escapeHtml(validUntil)}. The link is private to you, so please do not forward it.</p>`,
    `<p>Kind regards,<br>${escapeHtml(senderName)}</p>`,
  ].join("\n");
}
