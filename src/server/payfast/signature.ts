import { createHash, timingSafeEqual } from "node:crypto";

/**
 * PayFast MD5 signature generation + comparison.
 *
 * Verified against PayFast's live docs 2026-07-18 (see ./types.ts):
 *
 *   1. Build a query string from the fields to sign, in a fixed order,
 *      skipping any field that is undefined/null/blank after trimming.
 *   2. URL-encode each (trimmed) value the way PHP's urlencode() would:
 *      spaces as "+", uppercase hex escapes, AND escaping `! ' ( ) * ~`
 *      — six characters JS's encodeURIComponent leaves unescaped that
 *      PHP's urlencode() does not. This gap was a real bug found this
 *      session: any field value or passphrase containing one of these
 *      characters produced a signature that could never match PayFast's,
 *      surfacing as "Generated signature does not match submitted
 *      signature" on real sandbox transactions.
 *   3. If a passphrase is configured, append "&passphrase=<encoded>".
 *   4. MD5-hash the resulting string; the hex digest is the signature.
 *
 * SERVER-ONLY. Never import from src/lib or src/routes (browser code) —
 * the passphrase must never reach a browser bundle.
 */

/** Ordered list of [fieldName, value] pairs — order must match whichever
 *  direction you're signing for (see comments in types.ts / api.ts). */
export type SignableFields = Array<[string, string | number | undefined | null]>;

// Characters PHP's urlencode() percent-escapes that JS's encodeURIComponent
// deliberately does NOT (they're "unreserved" under RFC 3986, but PayFast's
// reference implementation follows the older application/x-www-form-urlencoded
// convention, which escapes all six of these). Confirmed against PayFast's
// live docs 2026-07-18 — this was the actual cause of a real "Generated
// signature does not match submitted signature" error: any field value (or
// the passphrase) containing one of these characters silently produced a
// different byte string locally than what PayFast's PHP backend recomputes,
// so the signatures never matched even though the rest of the algorithm
// (field order, uppercase hex, "+" for spaces) was already correct.
const PHP_URLENCODE_EXTRA: Record<string, string> = {
  "!": "%21",
  "'": "%27",
  "(": "%28",
  ")": "%29",
  "*": "%2A",
  "~": "%7E",
};

function payfastEncode(value: string): string {
  // application/x-www-form-urlencoded style: spaces become "+", and PHP's
  // urlencode() escapes a few extra characters encodeURIComponent leaves
  // alone (see PHP_URLENCODE_EXTRA above).
  return encodeURIComponent(value)
    .replace(/%20/g, "+")
    .replace(/[!'()*~]/g, (c) => PHP_URLENCODE_EXTRA[c]);
}

export function buildPayfastSignature(
  fields: SignableFields,
  passphrase?: string,
): string {
  // Trim before encoding, matching PayFast's reference PHP implementation
  // (urlencode(trim($val))) — guards against a field value with stray
  // leading/trailing whitespace producing a different encoded string than
  // whatever PayFast's server computes when it revalidates.
  const parts = fields
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim().length > 0)
    .map(([k, v]) => `${k}=${payfastEncode(String(v).trim())}`);

  let paramString = parts.join("&");
  if (passphrase) {
    paramString += `&passphrase=${payfastEncode(passphrase.trim())}`;
  }

  return createHash("md5").update(paramString, "utf8").digest("hex");
}

/**
 * Constant-time-ish comparison of two hex signature strings. MD5 hex
 * digests are fixed-length (32 chars) so this is safe with
 * timingSafeEqual as long as we guard the length check first (that
 * length check itself isn't constant-time, but leaking "signature was
 * the wrong length" isn't a meaningful oracle here).
 */
/**
 * Removes a single field from a raw application/x-www-form-urlencoded
 * body WITHOUT decoding/re-encoding anything else in it.
 *
 * This matters specifically for ITN verification: PayFast's signature is
 * computed over the exact bytes it sent, including empty fields (e.g.
 * `item_description=`, `custom_str2=`) — confirmed empirically against a
 * real sandbox ITN. Decoding each value and re-encoding it ourselves (via
 * encodeURIComponent) risks producing different escaping than whatever
 * PayFast's backend originally used for edge-case characters, even
 * though it happened not to matter for that particular payload. Working
 * directly on the raw substring avoids that risk entirely.
 */
export function stripFieldFromRawBody(rawBody: string, fieldName: string): string {
  return rawBody
    .split("&")
    .filter((segment) => !segment.startsWith(`${fieldName}=`))
    .join("&");
}

/**
 * Signs an already-encoded raw parameter string directly (no decode/
 * re-encode round-trip), appending `&passphrase=...` (freshly encoded,
 * since the passphrase itself was never part of the received bytes) if
 * set. Used for ITN verification — see stripFieldFromRawBody's comment.
 */
export function signRawParamString(rawParamString: string, passphrase?: string): string {
  let paramString = rawParamString;
  if (passphrase) {
    paramString += `&passphrase=${payfastEncode(passphrase.trim())}`;
  }
  return createHash("md5").update(paramString, "utf8").digest("hex");
}

export function signaturesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a.toLowerCase(), "utf8");
  const bufB = Buffer.from(b.toLowerCase(), "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Parse a raw application/x-www-form-urlencoded body into an ORDERED
 * array of [key, value] entries, preserving submission order — required
 * because ITN signature verification re-signs the fields in the order
 * PayFast sent them, not a fixed order (unlike the outbound once-off
 * fields, which DO use a fixed documented order).
 */
export function parseOrderedFormBody(raw: string): Array<[string, string]> {
  const params = new URLSearchParams(raw);
  return [...params.entries()];
}
