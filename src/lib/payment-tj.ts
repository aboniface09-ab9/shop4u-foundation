import type {
  CheckoutSession,
  CreateSessionInput,
  PaymentProvider,
} from "./payment";

/**
 * Transaction Junction (TJ) hosted payment page provider — CLIENT WRAPPER.
 *
 * ⚠️  ARCHITECTURE NOTE
 *
 * The actual TJ API integration is server-side only — see
 *   src/server/tj/oauth.ts
 *   src/server/tj/api.ts
 *   src/server/tj/types.ts
 *
 * That code lives on the server because the OAuth client_secret must
 * never touch the browser bundle. This file is the THIN CLIENT-SIDE
 * SHIM that just calls our own server endpoint, which in turn calls TJ.
 *
 * Flow:
 *   browser → fetch('/api/payment/create-session', {...})
 *           → server route reads TJ creds from Worker env
 *           → server calls TJ OAuth + Create Session
 *           → server returns { redirectUrl, sessionReference } to browser
 *           → browser redirects to redirectUrl
 *
 * The server route at /api/payment/create-session is the next thing
 * to be built — currently a TODO. It belongs in:
 *   src/routes/api/payment/create-session.ts (TanStack Start server route)
 *
 * Prerequisites before enabling this provider (set
 * VITE_PAYMENT_PROVIDER=tj):
 *   1. Merchant onboarding complete with TJ — you have merchantId,
 *      profileId, and a webhook URL configured.
 *   2. The four server-side env vars set in Cloudflare Worker env
 *      (NOT VITE_ prefixed):
 *        TJ_OAUTH_URL, TJ_API_BASE_URL, TJ_CLIENT_ID, TJ_CLIENT_SECRET,
 *        TJ_MERCHANT_ID, TJ_PROFILE_ID
 *   3. The /api/payment/create-session route built (server-side).
 *   4. The /api/payment/webhook route built (server-side; uses TJ's
 *      getTransaction for authoritative verification — see notes in
 *      src/server/tj/api.ts).
 *   5. Security review of the implementation.
 *
 * Until those are done, this provider is not activated (the default
 * provider is the mock — see src/lib/payment.ts).
 */
export const tjProvider: PaymentProvider = {
  name: "Transaction Junction (TJ)",

  async createCheckoutSession(input: CreateSessionInput): Promise<CheckoutSession> {
    const res = await fetch("/api/payment/create-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderReference: input.orderReference,
        amountCents: input.amountCents,
        currency: input.currency,
        customerEmail: input.customerEmail,
        customerName: input.customerName,
        returnUrl: input.returnUrl,
        cancelUrl: input.cancelUrl,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Couldn't start payment: ${res.status} ${text}`);
    }

    return (await res.json()) as CheckoutSession;
  },
};
