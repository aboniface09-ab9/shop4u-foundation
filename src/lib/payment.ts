/**
 * Payment provider abstraction.
 *
 * The rest of the app talks to whatever provider is active through this
 * interface. The actual provider lives behind it — mock for local dev,
 * TJ (or another SA gateway) for production. Swapping providers is a
 * single-line change to `getProvider()` below.
 *
 * The interface is intentionally minimal — just the two operations the
 * storefront actually needs at checkout time. Provider-specific concerns
 * (auth scheme, request shape, webhook signature verification) live
 * inside each provider implementation, not here.
 */

export type CheckoutSession = {
  /**
   * The URL to redirect the customer to (the hosted payment page).
   * Present for providers that support a plain redirect (mock, TJ).
   */
  redirectUrl?: string;
  /**
   * Present for providers whose hosted page requires a POST with signed
   * form fields rather than a plain redirect (PayFast's once-off flow —
   * the fields include a signature computed server-side from the
   * merchant's passphrase, so they can't be turned into a query string
   * this module builds itself). Use redirectToCheckout() below rather
   * than branching on this directly.
   */
  formPost?: {
    action: string;
    fields: Record<string, string>;
  };
  /** Provider-side reference for this session (used for reconciliation). */
  sessionReference: string;
};

/**
 * Sends the browser to the payment gateway, regardless of whether this
 * provider works via a plain redirect or a signed form POST. Call this
 * instead of reading `redirectUrl`/`formPost` directly.
 */
export function redirectToCheckout(session: CheckoutSession): void {
  if (session.redirectUrl) {
    window.location.href = session.redirectUrl;
    return;
  }
  if (session.formPost) {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = session.formPost.action;
    form.style.display = "none";
    for (const [name, value] of Object.entries(session.formPost.fields)) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
    return;
  }
  throw new Error("CheckoutSession has neither redirectUrl nor formPost — can't redirect.");
}

export type CreateSessionInput = {
  /** The platform's own order reference (e.g. "FND-1043"). */
  orderReference: string;
  /** Amount in cents. */
  amountCents: number;
  /** Three-letter currency code, e.g. "ZAR". */
  currency: string;
  /** Customer email for the receipt + 3DS challenge. */
  customerEmail: string;
  /** Customer name on the order. */
  customerName: string;
  /** Where the gateway sends the customer on success. */
  returnUrl: string;
  /** Where the gateway sends the customer on cancel/failure. */
  cancelUrl: string;
};

export interface PaymentProvider {
  /** Human-readable name shown in admin & logs. */
  readonly name: string;
  /**
   * Create a hosted payment session and return the URL to redirect the
   * customer to. Implementations talk to their gateway's API here.
   */
  createCheckoutSession(input: CreateSessionInput): Promise<CheckoutSession>;
}

// =========================================================================
// Active provider selection.
//
// Defaults to "mock" for local dev. Switch providers by setting
// VITE_PAYMENT_PROVIDER=tj or =payfast in .env.local AND providing the
// provider-specific env vars (see src/lib/payment-tj.ts and
// src/lib/payment-payfast.ts). Refusing to default to a real provider
// keeps developers from accidentally hitting a real sandbox or
// production endpoint.
// =========================================================================

import { mockProvider } from "./payment-mock";
import { tjProvider } from "./payment-tj";
import { payfastProvider } from "./payment-payfast";

export function getProvider(): PaymentProvider {
  const id = import.meta.env.VITE_PAYMENT_PROVIDER ?? "mock";
  switch (id) {
    case "tj":
      return tjProvider;
    case "payfast":
      return payfastProvider;
    case "mock":
    default:
      return mockProvider;
  }
}
