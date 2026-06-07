import type {
  CheckoutSession,
  CreateSessionInput,
  PaymentProvider,
} from "./payment";

/**
 * Mock payment provider — for local development and demos ONLY.
 *
 * Instead of calling out to a real gateway, this redirects the customer
 * to an in-app fake hosted page at /mock-gateway/:reference where they
 * can click Pay or Cancel. Useful for testing the full checkout flow
 * end-to-end without any real money or card data.
 *
 * NEVER use this in production. The route guards rendering this page
 * in dev mode only would be a reasonable hardening step before any
 * deploy.
 */
export const mockProvider: PaymentProvider = {
  name: "Mock Gateway (dev only)",

  async createCheckoutSession(input: CreateSessionInput): Promise<CheckoutSession> {
    // Brief artificial latency so the spinner state is visible during dev.
    await new Promise((r) => setTimeout(r, 200));

    const sessionRef = `MOCK-${Date.now()}`;
    // Build the redirect URL to our own mock-gateway route, passing the
    // order reference and the eventual return/cancel URLs as query
    // params so the mock page can navigate to them after pay/cancel.
    const url = new URL(
      `/mock-gateway/${encodeURIComponent(input.orderReference)}`,
      window.location.origin,
    );
    url.searchParams.set("amount", String(input.amountCents));
    url.searchParams.set("currency", input.currency);
    url.searchParams.set("email", input.customerEmail);
    url.searchParams.set("return", input.returnUrl);
    url.searchParams.set("cancel", input.cancelUrl);

    return {
      redirectUrl: url.toString(),
      sessionReference: sessionRef,
    };
  },
};
