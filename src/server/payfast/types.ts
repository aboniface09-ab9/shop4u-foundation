/**
 * PayFast API types — once-off (onsite/hosted payment page) integration.
 *
 * Type definitions derived from PayFast's documented Onsite/Hosted Payment
 * Page + ITN (Instant Transaction Notification) integration.
 *
 * ⚠️ Verified against live docs 2026-07-18 (via a JS-capable browser fetch
 * — the docs site is client-rendered and plain HTTP fetches return an
 * empty shell, which is why this wasn't checked sooner). Field names and
 * order below match https://developers.payfast.co.za/docs exactly as of
 * that date. This same session also found and fixed a real signature bug
 * in ../payfast/signature.ts: PHP's urlencode() escapes `! ' ( ) * ~`,
 * which JS's encodeURIComponent leaves alone — see the comment there.
 * PayFast's docs can change; re-diff before go-live if it's been a while.
 *
 * SERVER-ONLY: this module lives under src/server/ and must never be
 * imported by browser code. Contains only types, no secrets — the
 * convention keeps things tidy and mirrors src/server/tj/types.ts.
 */

// =========================================================================
// Per-tenant merchant config (loaded from tenant_payfast_config, never
// from a global env var — each merchant settles to their own account).
// =========================================================================

export type PayfastMerchantConfig = {
  merchantId: string;
  merchantKey: string;
  /** PayFast strongly recommends always setting one; keep it optional in
   *  the type only because PayFast technically allows omitting it. */
  passphrase?: string;
  mode: "sandbox" | "live";
};

// =========================================================================
// Once-off payment — outbound fields (browser is redirected/auto-submits
// a form with these to PayFast's hosted payment page).
//
// Field order matters for signature generation — PayFast's docs specify
// building the signature string in the same order fields are documented,
// not alphabetically. Order used here (verify against live docs):
//   merchant_id, merchant_key, return_url, cancel_url, notify_url,
//   name_first, name_last, email_address, cell_number,
//   m_payment_id, amount, item_name, item_description,
//   custom_str1..5, custom_int1..5,
//   email_confirmation, confirmation_address
// =========================================================================

export type PayfastOnceOffFields = {
  merchant_id: string;
  merchant_key: string;
  return_url: string;
  cancel_url: string;
  notify_url: string;
  name_first?: string;
  name_last?: string;
  email_address?: string;
  cell_number?: string;
  m_payment_id: string; // our own order reference, e.g. "FND-LX2N9K"
  amount: string; // decimal string with 2dp, e.g. "249.00" — NOT cents
  item_name: string;
  item_description?: string;
  custom_str1?: string;
  custom_str2?: string;
  custom_str3?: string;
  email_confirmation?: "0" | "1";
  confirmation_address?: string;
};

// =========================================================================
// ITN (Instant Transaction Notification) — PayFast's server-to-server
// webhook. Field names per PayFast's documented ITN payload.
//
// Treat every field here as UNTRUSTED input until verified — see
// verifyItn() in api.ts, which (a) recomputes the signature, (b) posts
// the raw payload back to PayFast's /eng/query/validate endpoint and
// requires "VALID", and (c) re-derives the expected amount from our own
// order record rather than trusting amount_gross. This mirrors the
// "never trust the webhook payload, verify authoritatively" pattern used
// in src/server/tj/api.ts.
// =========================================================================

export type PayfastItnPayload = {
  m_payment_id: string; // our order reference
  pf_payment_id: string; // PayFast's own transaction id
  payment_status: PayfastPaymentStatus;
  item_name?: string;
  item_description?: string;
  amount_gross: string; // decimal string, e.g. "249.00"
  amount_fee?: string;
  amount_net?: string;
  custom_str1?: string;
  custom_str2?: string;
  custom_str3?: string;
  name_first?: string;
  name_last?: string;
  email_address?: string;
  merchant_id: string;
  signature: string;
  // Only present on recurring-billing ITNs (subscription signup + every
  // subsequent charge) — the Recurring Billing API's identifier for this
  // card-on-file, used for all future POST /subscriptions/{token}/adhoc
  // calls. NOT present on once-off (storefront customer checkout) ITNs.
  // See payfast-subscription-billing-brief.md.
  token?: string;
};

export type PayfastPaymentStatus = "COMPLETE" | "FAILED" | "PENDING";

export type AppOrderStatus =
  | "pending"
  | "paid"
  | "fulfilled"
  | "refunded"
  | "cancelled";

export function mapPayfastStatusToOrderStatus(
  status: PayfastPaymentStatus,
): AppOrderStatus {
  switch (status) {
    case "COMPLETE":
      return "paid";
    case "FAILED":
      return "cancelled";
    case "PENDING":
    default:
      return "pending";
  }
}

// =========================================================================
// Result of verifyItn() — the ITN route handler branches on this rather
// than re-implementing verification logic itself.
// =========================================================================

export type ItnVerificationResult =
  | { ok: true; payload: PayfastItnPayload }
  | { ok: false; reason: string };

// =========================================================================
// Recurring Billing API — used ONLY for charging a merchant's own
// YouCommerce subscription (via a stored token), never for the once-off
// storefront checkout flow above. See payfast-subscription-billing-brief.md.
//
// ⚠️ This is a DIFFERENT PayFast API from everything above: server-to-server,
// header-based auth, alphabetically-sorted signature (not the fixed field
// order used by the once-off flow), lowercase MD5 output, base URL
// https://api.payfast.co.za for BOTH live and sandbox (unlike the once-off
// flow's sandbox.payfast.co.za / www.payfast.co.za split) — sandbox is
// toggled via a `?testing=true` query string on that same host instead.
// Re-confirmed field-for-field against PayFast's live /api docs 2026-07-25
// (merchant account now live) — see recurring-api.ts for what was fixed
// as a result (sandbox testing=true support was entirely missing).
// =========================================================================

/**
 * Your OWN PayFast merchant account — singular, unlike PayfastMerchantConfig
 * (which is one row per platform TENANT). There's only ever one of these:
 * you, charging merchants for their subscription. Lives in Worker secrets
 * (PLATFORM_PAYFAST_MERCHANT_ID/KEY/PASSPHRASE), never in a DB table
 * readable by the anon/authenticated client.
 */
export type PlatformPayfastConfig = {
  merchantId: string;
  merchantKey: string; // needed for the hosted-page signup form (buildSubscriptionSignup) — not for the adhoc charge API itself, which only uses merchant-id
  /** REQUIRED for recurring billing (unlike the once-off flow, where it's
   *  optional-but-recommended) — PayFast's docs are explicit about this. */
  passphrase: string;
  mode: "sandbox" | "live";
};

export type AdhocChargeInput = {
  token: string; // from the signup ITN's `token` field
  amountCents: number; // integer cents — NOT a decimal string like the once-off flow
  itemName: string;
  itemDescription?: string;
  mPaymentId?: string;
};

export type AdhocChargeResult =
  | { ok: true; raw: unknown }
  | { ok: false; status: number; reason: string };
