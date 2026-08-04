import type {
  CheckoutSession,
  CreateSessionInput,
  PaymentProvider,
} from "./payment";

/**
 * PayFast once-off (onsite/hosted payment page) provider — CLIENT WRAPPER.
 *
 * ⚠️ ARCHITECTURE NOTE — mirrors src/lib/payment-tj.ts
 *
 * The actual field-building + signing happens server-side — see
 *   src/server/payfast/types.ts
 *   src/server/payfast/signature.ts
 *   src/server/payfast/api.ts
 *
 * That code lives on the server because the merchant_key and (especially)
 * the passphrase must never touch the browser bundle — the passphrase is
 * what lets someone forge a valid-looking payment. This file is the THIN
 * CLIENT-SIDE SHIM that just calls our own server endpoint.
 *
 * Flow:
 *   browser → fetch('/api/payment/payfast/checkout-fields', {...})
 *           → server route looks up this tenant's PayFast credentials
 *             from tenant_payfast_config (service-role Supabase client)
 *           → server builds + signs the field set
 *           → server returns { action, fields, sessionReference }
 *           → browser auto-submits a hidden form POST to `action`
 *             (see redirectToCheckout() in src/lib/payment.ts)
 *
 * Unlike TJ, there's no "redirectUrl" — PayFast's hosted page expects a
 * form POST of the signed fields, not a GET redirect. CheckoutSession's
 * `formPost` shape (see payment.ts) exists specifically for this.
 *
 * The server route at /api/payment/payfast/checkout-fields and the ITN
 * webhook route at /api/payment/payfast/notify are the next things to
 * wire up for real — see payfast-integration-brief.md for what's built,
 * what's pending, and the pre-go-live security checklist.
 *
 * Prerequisites before enabling this provider (set
 * VITE_PAYMENT_PROVIDER=payfast):
 *   1. This tenant has a row in tenant_payfast_config (their own
 *      merchant_id/merchant_key/passphrase — never a shared global one).
 *   2. SUPABASE_SERVICE_ROLE_KEY set as a Cloudflare Worker secret (the
 *      checkout-fields and notify routes need it to read that table).
 *   3. The two server routes built and deployed.
 *   4. Security review of the implementation (checklist in the brief).
 *
 * Until those are done, this provider is not activated (the default
 * provider is the mock — see src/lib/payment.ts).
 */
export const payfastProvider: PaymentProvider = {
  name: "PayFast",

  async createCheckoutSession(input: CreateSessionInput): Promise<CheckoutSession> {
    const res = await fetch("/api/payment/payfast/checkout-fields", {
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

    const { action, fields, sessionReference } = (await res.json()) as {
      action: string;
      fields: Record<string, string>;
      sessionReference: string;
    };

    return { formPost: { action, fields }, sessionReference };
  },
};
