import {
  buildPayfastSignature,
  parseOrderedFormBody,
  signaturesMatch,
  signRawParamString,
  stripFieldFromRawBody,
  type SignableFields,
} from "./signature";
import type {
  ItnVerificationResult,
  PayfastItnPayload,
  PayfastMerchantConfig,
  PayfastOnceOffFields,
  PlatformPayfastConfig,
} from "./types";

/**
 * PayFast API client — server-only. Mirrors the shape/spirit of
 * src/server/tj/api.ts: callers provide merchant config (loaded per-tenant
 * from tenant_payfast_config, never a single global env var — each
 * merchant settles to their own PayFast account), this module handles the
 * PayFast-specific mechanics.
 *
 * Unlike TJ, PayFast's once-off flow has no "create session" API call —
 * you build a signed set of form fields locally and send the customer's
 * browser to PayFast's hosted page with them (redirect or auto-submitting
 * form POST). No network call to PayFast happens until the customer pays
 * and PayFast sends the ITN webhook.
 *
 * SERVER-ONLY: do not import from src/lib or src/routes (browser bundles).
 */

const PAYFAST_HOSTS = {
  sandbox: "sandbox.payfast.co.za",
  live: "www.payfast.co.za",
} as const;

export function payfastProcessUrl(mode: "sandbox" | "live"): string {
  return `https://${PAYFAST_HOSTS[mode]}/eng/process`;
}

function payfastValidateUrl(mode: "sandbox" | "live"): string {
  return `https://${PAYFAST_HOSTS[mode]}/eng/query/validate`;
}

// =========================================================================
// Once-off payment — build the signed field set for the hosted page.
// =========================================================================

export type BuildOnceOffInput = {
  orderReference: string; // our m_payment_id
  amountCents: number;
  customerEmail?: string;
  customerName?: string; // split into name_first/name_last by caller if available
  itemName: string;
  itemDescription?: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  /** Free-text fields for reconciliation; PayFast echoes these back in
   *  the ITN. Use for e.g. tenant slug, so the ITN handler doesn't have
   *  to guess which tenant an order belongs to. */
  customStr1?: string;
  customStr2?: string;
  customStr3?: string;
};

export function buildOnceOffPayment(
  merchant: PayfastMerchantConfig,
  input: BuildOnceOffInput,
): { action: string; fields: PayfastOnceOffFields & { signature: string } } {
  const amount = (input.amountCents / 100).toFixed(2);

  const [nameFirst, ...rest] = (input.customerName ?? "").trim().split(/\s+/);
  const nameLast = rest.join(" ");

  // Trim every string field so the value we actually POST is byte-identical
  // to the (also-trimmed) value buildPayfastSignature() hashes — otherwise
  // stray whitespace from user input (pasted email, etc.) could make the
  // signed string and the transmitted field diverge.
  const trim = (v: string | undefined) => (v === undefined ? undefined : v.trim());

  const fields: PayfastOnceOffFields = {
    merchant_id: merchant.merchantId,
    merchant_key: merchant.merchantKey,
    return_url: input.returnUrl,
    cancel_url: input.cancelUrl,
    notify_url: input.notifyUrl,
    name_first: nameFirst || undefined,
    name_last: nameLast || undefined,
    email_address: trim(input.customerEmail),
    m_payment_id: input.orderReference,
    amount,
    item_name: input.itemName.trim(),
    item_description: trim(input.itemDescription),
    custom_str1: trim(input.customStr1),
    custom_str2: trim(input.customStr2),
    custom_str3: trim(input.customStr3),
  };

  // Fixed documented order — see the comment in ./types.ts. Signature
  // MUST be computed over exactly this order, excluding empty fields.
  const orderedForSignature: SignableFields = [
    ["merchant_id", fields.merchant_id],
    ["merchant_key", fields.merchant_key],
    ["return_url", fields.return_url],
    ["cancel_url", fields.cancel_url],
    ["notify_url", fields.notify_url],
    ["name_first", fields.name_first],
    ["name_last", fields.name_last],
    ["email_address", fields.email_address],
    ["m_payment_id", fields.m_payment_id],
    ["amount", fields.amount],
    ["item_name", fields.item_name],
    ["item_description", fields.item_description],
    ["custom_str1", fields.custom_str1],
    ["custom_str2", fields.custom_str2],
    ["custom_str3", fields.custom_str3],
  ];

  const signature = buildPayfastSignature(orderedForSignature, merchant.passphrase);

  return {
    action: payfastProcessUrl(merchant.mode),
    fields: { ...fields, signature },
  };
}

// =========================================================================
// Subscription signup (tokenization card capture) — for a MERCHANT paying
// their own YouCommerce subscription, not a storefront customer checkout.
// See payfast-subscription-billing-brief.md. Reuses the same hosted-page
// signature scheme as buildOnceOffPayment (this part is NOT the Recurring
// Billing API — that's recurring-api.ts, used only for the ongoing
// adhoc charges once a token exists).
// =========================================================================

export type BuildSubscriptionSignupInput = {
  tenantSlug: string; // which merchant is signing up — becomes custom_str1
  /** 0 for a pure card-capture (no charge yet); the plan's first-month
   *  fee to charge immediately and capture the token in one step. */
  amountCents: number;
  itemName: string; // e.g. "YouCommerce — Growth plan"
  customerEmail?: string;
  customerName?: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
};

export function buildSubscriptionSignup(
  merchant: PlatformPayfastConfig,
  input: BuildSubscriptionSignupInput,
): { action: string; fields: PayfastOnceOffFields & { subscription_type: "2"; signature: string } } {
  const amount = (input.amountCents / 100).toFixed(2);
  const [nameFirst, ...rest] = (input.customerName ?? "").trim().split(/\s+/);
  const nameLast = rest.join(" ");
  const trim = (v: string | undefined) => (v === undefined ? undefined : v.trim());

  const fields: PayfastOnceOffFields & { subscription_type: "2" } = {
    merchant_id: merchant.merchantId,
    merchant_key: merchant.merchantKey,
    return_url: input.returnUrl,
    cancel_url: input.cancelUrl,
    notify_url: input.notifyUrl,
    name_first: nameFirst || undefined,
    name_last: nameLast || undefined,
    email_address: trim(input.customerEmail),
    m_payment_id: `sub-${input.tenantSlug}-${Date.now().toString(36)}`,
    amount,
    item_name: input.itemName.trim(),
    custom_str1: input.tenantSlug,
    subscription_type: "2",
  };

  // Fixed documented order, same convention as buildOnceOffPayment, with
  // subscription_type appended at the end (it's a Recurring Billing
  // addition to the base field set, not part of the original documented
  // order — kept last since PayFast's docs don't specify where it slots
  // in, and the order only has to be internally consistent between what
  // we sign and what we send, not match PayFast's base-flow order exactly
  // for this extra field).
  const orderedForSignature: SignableFields = [
    ["merchant_id", fields.merchant_id],
    ["merchant_key", fields.merchant_key],
    ["return_url", fields.return_url],
    ["cancel_url", fields.cancel_url],
    ["notify_url", fields.notify_url],
    ["name_first", fields.name_first],
    ["name_last", fields.name_last],
    ["email_address", fields.email_address],
    ["m_payment_id", fields.m_payment_id],
    ["amount", fields.amount],
    ["item_name", fields.item_name],
    ["custom_str1", fields.custom_str1],
    ["subscription_type", fields.subscription_type],
  ];

  // Passphrase is REQUIRED for recurring billing (unlike the once-off
  // flow, where buildPayfastSignature() just omits it if unset) — fail
  // loudly rather than silently producing a signature PayFast will
  // always reject.
  if (!merchant.passphrase) {
    throw new Error(
      "PlatformPayfastConfig.passphrase is required for subscription signup — set one on your PayFast account's Settings page first.",
    );
  }

  const signature = buildPayfastSignature(orderedForSignature, merchant.passphrase);

  return {
    action: payfastProcessUrl(merchant.mode),
    fields: { ...fields, signature },
  };
}

// =========================================================================
// ITN (webhook) verification.
//
// Three checks, all must pass before the order is trusted as paid:
//   1. Signature matches (recomputed from the raw posted fields, in the
//      order PayFast sent them, + our passphrase).
//   2. PayFast's own server-to-server "validate" endpoint echoes back
//      the literal string "VALID" for this exact raw payload. This is
//      the authoritative check — equivalent in spirit to TJ's
//      getTransaction() re-fetch (never trust the payload alone).
//   3. The amount in the ITN matches what WE expect for this order,
//      re-derived from our own order record — not just "is present".
//
// Source-IP allowlisting is intentionally NOT a hard gate here: PayFast
// documents a reverse-DNS check against their domains, but Cloudflare
// Workers has no general DNS resolution API to perform that lookup, and
// hardcoding PayFast's current IP ranges risks silently breaking
// legitimate payments if those ranges change. If you want defense in
// depth, populate `allowedIpPrefixes` (checked against
// request.headers["cf-connecting-ip"]) from PayFast's currently
// published ITN IP list — treat it as a soft/logged check, not the
// thing standing between an attacker and a fake "paid" order.
// =========================================================================

export type VerifyItnInput = {
  rawBody: string;
  merchant: PayfastMerchantConfig;
  /** Re-derived server-side from your own order record — NOT read from
   *  the ITN payload. Pass the amount you expect this order to be paid
   *  for, in cents. Omit ONLY when there's genuinely no pre-existing
   *  record to check against (e.g. subscription signup — see
   *  handleSubscriptionNotify) — signature + the validate-endpoint call
   *  still fully authenticate the payload either way; this third check
   *  is extra defense specifically for "does it match what WE expected",
   *  which doesn't apply when there was no prior expectation. */
  expectedAmountCents?: number;
};

export async function verifyItn(input: VerifyItnInput): Promise<ItnVerificationResult> {
  const entries = parseOrderedFormBody(input.rawBody);
  const signatureEntry = entries.find(([k]) => k === "signature");
  if (!signatureEntry) {
    return { ok: false, reason: "ITN payload missing signature field" };
  }
  const providedSignature = signatureEntry[1];

  // Sign PayFast's original raw bytes directly (minus the signature
  // field) — NOT a decode/re-encode of the parsed entries. Confirmed
  // against a real sandbox ITN 2026-07-12: PayFast includes empty fields
  // (item_description=, custom_str2=, etc.) in its own signature input,
  // which the parsed/filtered `entries` approach was dropping.
  const rawWithoutSignature = stripFieldFromRawBody(input.rawBody, "signature");
  const expectedSignature = signRawParamString(rawWithoutSignature, input.merchant.passphrase);

  if (!signaturesMatch(expectedSignature, providedSignature)) {
    console.error("PayFast ITN verification failed — signature mismatch", {
      mPaymentId: entries.find(([k]) => k === "m_payment_id")?.[1],
    });
    return { ok: false, reason: "Signature mismatch" };
  }

  // Re-check with PayFast directly — the authoritative source of truth.
  const validateRes = await fetch(payfastValidateUrl(input.merchant.mode), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: input.rawBody,
  });
  const validateText = (await validateRes.text()).trim();
  if (validateText !== "VALID") {
    return { ok: false, reason: `PayFast validate endpoint returned "${validateText}"` };
  }

  const payload = Object.fromEntries(entries) as unknown as PayfastItnPayload;

  if (payload.merchant_id !== input.merchant.merchantId) {
    return { ok: false, reason: "merchant_id on ITN doesn't match the tenant's configured merchant" };
  }

  if (input.expectedAmountCents !== undefined) {
    const amountGrossCents = Math.round(parseFloat(payload.amount_gross) * 100);
    if (!Number.isFinite(amountGrossCents) || amountGrossCents !== input.expectedAmountCents) {
      return {
        ok: false,
        reason: `Amount mismatch: ITN said ${payload.amount_gross}, expected ${(input.expectedAmountCents / 100).toFixed(2)}`,
      };
    }
  }

  return { ok: true, payload };
}
