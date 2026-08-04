import { createHash } from "node:crypto";

import type { AdhocChargeInput, AdhocChargeResult, PlatformPayfastConfig } from "./types";

/**
 * PayFast Recurring Billing API — server-to-server, used to charge a
 * merchant's stored card-on-file for their YouCommerce subscription.
 *
 * ⚠️ NOT the same signature scheme as src/server/payfast/signature.ts
 * (that's for the once-off hosted-page flow). PayFast's docs are explicit
 * that this API's signature must NOT use that fixed-field-order
 * convention — it's alphabetically sorted instead (PHP reference impl:
 * ksort($pfData) + http_build_query($pfData), then MD5, lower-case hex).
 * Re-confirmed field-for-field against PayFast's live /api docs
 * 2026-07-25 (previously only confirmed 2026-07-18, before the merchant
 * account existed to test against): header names (merchant-id, version,
 * timestamp, signature — all lower-kebab), the alphabetical-sort +
 * http_build_query encoding (identical to PHP's urlencode: "+" for
 * spaces, uppercase hex), and lower-case MD5 hex output are all correct
 * as implemented below. One real gap was found and fixed: this file had
 * no sandbox/testing-mode support at all — see RECURRING_API_BASE below.
 *
 * SERVER-ONLY. Never import from src/lib or src/routes (browser code).
 */

const RECURRING_API_BASE = "https://api.payfast.co.za";
const API_VERSION = "v1";

// Confirmed against PayFast's live docs 2026-07-25: unlike the once-off
// flow (sandbox.payfast.co.za vs www.payfast.co.za — different hosts),
// the Recurring Billing API uses this SAME host for both live and
// sandbox. Sandbox mode is toggled with a `?testing=true` query string
// appended to the request URL instead — see the url construction in
// chargeSubscriptionAdhoc(). Docs explicitly note the `testing` param
// must be EXCLUDED from the signature (it's a query-string-only flag,
// never added to headerVars/bodyVars below, so this is satisfied by
// construction).

// Same PHP-urlencode-style encoding as the once-off flow (uppercase hex,
// "+" for spaces, and the six extra characters PHP's urlencode() escapes
// that JS's encodeURIComponent doesn't — see signature.ts for the same
// gotcha that caused a real signature-mismatch bug earlier). Confirmed
// 2026-07-25: PayFast's reference PHP implementation for this API builds
// the signature source string with http_build_query(), which defaults to
// PHP_QUERY_RFC1738 encoding — byte-for-byte the same convention as
// urlencode(). Not a different scheme after all.
function payfastEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, "+")
    .replace(/[!'()*~]/g, (c) => ({ "!": "%21", "'": "%27", "(": "%28", ")": "%29", "*": "%2A", "~": "%7E" })[c]!);
}

/**
 * Builds the recurring-API signature: sort ALL submitted variables
 * (headers + body + query string, excluding `signature` itself and
 * `testing` if in test mode) alphabetically by key, concatenate as
 * `key=urlencoded_value` joined by `&`, append `&passphrase=...`, MD5,
 * lowercase hex digest.
 */
function signRecurringApiRequest(
  variables: Record<string, string | number | undefined>,
  passphrase: string,
): string {
  const entries = Object.entries(variables)
    .filter(([k, v]) => k !== "signature" && v !== undefined && v !== null && String(v).length > 0)
    .sort(([a], [b]) => a.localeCompare(b));

  const paramString = entries
    .map(([k, v]) => `${k}=${payfastEncode(String(v))}`)
    .concat(`passphrase=${payfastEncode(passphrase)}`)
    .join("&");

  return createHash("md5").update(paramString, "utf8").digest("hex").toLowerCase();
}

function isoTimestamp(): string {
  // YYYY-MM-DDTHH:MM:SS+00:00 — Date#toISOString gives "Z" for UTC, but
  // PayFast's example format is "+HH:MM"; swap it for consistency with
  // their documented format (functionally equivalent to Z, some APIs are
  // stricter about accepting it than others).
  return new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

/**
 * Charge a stored token (subscription or tokenization card-on-file) an
 * arbitrary amount, on demand. This is the entire point of choosing
 * tokenization over PayFast's native Subscriptions — see
 * payfast-subscription-billing-brief.md.
 */
export async function chargeSubscriptionAdhoc(
  merchant: PlatformPayfastConfig,
  input: AdhocChargeInput,
): Promise<AdhocChargeResult> {
  const timestamp = isoTimestamp();

  const headerVars: Record<string, string> = {
    "merchant-id": merchant.merchantId,
    version: API_VERSION,
    timestamp,
  };

  const bodyVars: Record<string, string | number | undefined> = {
    amount: input.amountCents,
    item_name: input.itemName,
    item_description: input.itemDescription,
    m_payment_id: input.mPaymentId,
    // We already await a synchronous JSON response below and use that as
    // the source of truth — skip the async ITN for ad-hoc charges
    // entirely rather than reconciling two write paths for the same
    // charge. (Signup still uses the async ITN via handleSubscriptionNotify
    // since that flow has no synchronous confirmation of its own.)
    itn: "false",
  };

  const signature = signRecurringApiRequest({ ...headerVars, ...bodyVars }, merchant.passphrase);

  // testing=true is query-string-only — never added to headerVars/bodyVars
  // above, so it's correctly excluded from the signature per PayFast's docs.
  const url = `${RECURRING_API_BASE}/subscriptions/${encodeURIComponent(input.token)}/adhoc${
    merchant.mode === "sandbox" ? "?testing=true" : ""
  }`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "merchant-id": merchant.merchantId,
        version: API_VERSION,
        timestamp,
        signature,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: Object.entries(bodyVars)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${payfastEncode(String(v))}`)
        .join("&"),
    });
  } catch (err) {
    return { ok: false, status: 0, reason: err instanceof Error ? err.message : "Network error" };
  }

  const raw = await response.json().catch(() => undefined);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      reason: `PayFast returned ${response.status}: ${JSON.stringify(raw)}`,
    };
  }

  return { ok: true, raw };
}
