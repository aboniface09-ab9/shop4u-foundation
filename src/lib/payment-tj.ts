import type {
  CheckoutSession,
  CreateSessionInput,
  PaymentProvider,
} from "./payment";

/**
 * Transaction Junction (TJ) hosted payment page provider — STUB.
 *
 * This file is the contract between the app and TJ's gateway. All
 * TJ-specific concerns (endpoint URL, auth scheme, request shape,
 * webhook signature verification) live here and ONLY here.
 *
 * ⚠️  IMPORTANT — DO NOT ENABLE WITHOUT:
 *     1. Confirmed TJ sandbox credentials in your `.env.local`
 *        (see TODO markers below).
 *     2. A security/compliance review of this integration.
 *     3. A signed integration agreement with TJ if required.
 *
 * The implementation below intentionally throws on every call until
 * the TODO blocks are filled in with TJ's actual integration spec.
 *
 * To activate once ready: set VITE_PAYMENT_PROVIDER=tj in .env.local
 * (and the TJ-specific env vars).
 */

// =========================================================================
// Env vars — names are placeholders; replace with whatever TJ requires.
// =========================================================================
const TJ_BASE_URL = import.meta.env.VITE_TJ_BASE_URL;       // e.g. "https://sandbox.tj.example/api"
const TJ_MERCHANT_ID = import.meta.env.VITE_TJ_MERCHANT_ID; // your merchant identifier
const TJ_API_KEY = import.meta.env.VITE_TJ_API_KEY;         // or whatever auth scheme TJ uses

export const tjProvider: PaymentProvider = {
  name: "Transaction Junction (TJ)",

  async createCheckoutSession(input: CreateSessionInput): Promise<CheckoutSession> {
    if (!TJ_BASE_URL || !TJ_MERCHANT_ID || !TJ_API_KEY) {
      throw new Error(
        "TJ provider not configured. Set VITE_TJ_BASE_URL, VITE_TJ_MERCHANT_ID, VITE_TJ_API_KEY in .env.local — and confirm with TJ docs whether all three are correct.",
      );
    }

    // ====================================================================
    // TODO — TJ integration team:
    //
    // 1. Replace the URL, request body shape, headers, and auth scheme
    //    below with whatever TJ's hosted-page API actually expects.
    //    The fields used here (orderReference, amountCents, currency,
    //    customer email/name, returnUrl, cancelUrl) are the standard
    //    inputs every gateway needs — map them onto TJ's parameter names.
    //
    // 2. If TJ requires HMAC signing of the request body, do it here.
    //    The signing secret should be a separate env var (e.g.
    //    VITE_TJ_SIGNING_SECRET) — but if signing must use a server-only
    //    secret, this whole function needs to move behind a server
    //    function and the secret stays in Workers env (not VITE_).
    //
    // 3. Parse TJ's response and return the redirectUrl + sessionReference.
    //
    // 4. The webhook receiver lives in src/routes/api.payment-webhook.ts
    //    (to be created when this is wired up). It validates TJ's
    //    signature on the callback and updates the matching order row
    //    in Supabase.
    // ====================================================================

    throw new Error(
      "TJ provider is a stub. Implement createCheckoutSession() against TJ's actual API before enabling.",
    );

    // Reference implementation skeleton, left commented for guidance:
    //
    // const body = {
    //   merchantId: TJ_MERCHANT_ID,
    //   reference: input.orderReference,
    //   amount: input.amountCents,
    //   currency: input.currency,
    //   customer: {
    //     email: input.customerEmail,
    //     name: input.customerName,
    //   },
    //   urls: {
    //     return: input.returnUrl,
    //     cancel: input.cancelUrl,
    //     // webhook: maybe configured at merchant level rather than per-request
    //   },
    // };
    //
    // const res = await fetch(`${TJ_BASE_URL}/checkout/sessions`, {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //     Authorization: `Bearer ${TJ_API_KEY}`,
    //   },
    //   body: JSON.stringify(body),
    // });
    //
    // if (!res.ok) {
    //   throw new Error(`TJ session create failed: ${res.status} ${await res.text()}`);
    // }
    //
    // const data = await res.json();
    // return {
    //   redirectUrl: data.hostedPageUrl,
    //   sessionReference: data.sessionId,
    // };
  },
};
