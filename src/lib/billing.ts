import { redirectToCheckout } from "@/lib/payment";

/**
 * Client-side helper for a merchant setting up (or re-authorizing) their
 * own YouCommerce subscription billing — NOT the storefront checkout flow
 * in src/lib/payment*.ts. Called from Admin → Settings → Billing.
 *
 * Same "browser never touches real credentials" shape as the storefront
 * checkout: this just calls our own server route, which signs against
 * YOUR platform PayFast credentials (Worker secrets), and gets back a
 * signed field set to submit to PayFast's hosted page.
 *
 * See payfast-subscription-billing-brief.md — NOT tested end-to-end yet.
 */
export async function startSubscriptionSignup(input: {
  amountCents: number; // 0 for pure card-capture, or the plan's monthly fee to charge immediately
  itemName: string;
  customerEmail?: string;
  customerName?: string;
}): Promise<void> {
  const origin = window.location.origin;

  const res = await fetch("/api/payment/payfast/subscription-checkout-fields", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amountCents: input.amountCents,
      itemName: input.itemName,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      returnUrl: `${origin}/admin/settings?billing=success`,
      cancelUrl: `${origin}/admin/settings?billing=cancelled`,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Couldn't start billing signup: ${res.status} ${text}`);
  }

  const { action, fields } = (await res.json()) as { action: string; fields: Record<string, string> };
  redirectToCheckout({ formPost: { action, fields }, sessionReference: "billing-signup" });
}
