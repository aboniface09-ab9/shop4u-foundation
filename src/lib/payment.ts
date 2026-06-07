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
  /** The URL to redirect the customer to (the hosted payment page). */
  redirectUrl: string;
  /** Provider-side reference for this session (used for reconciliation). */
  sessionReference: string;
};

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
// Defaults to "mock" for local dev. Switch to "tj" by setting
// VITE_PAYMENT_PROVIDER=tj in .env.local AND providing the TJ-specific
// env vars (see src/lib/payment-tj.ts). Refusing to default to "tj"
// keeps developers from accidentally hitting a real sandbox or
// production endpoint.
// =========================================================================

import { mockProvider } from "./payment-mock";
import { tjProvider } from "./payment-tj";

export function getProvider(): PaymentProvider {
  const id = import.meta.env.VITE_PAYMENT_PROVIDER ?? "mock";
  switch (id) {
    case "tj":
      return tjProvider;
    case "mock":
    default:
      return mockProvider;
  }
}
