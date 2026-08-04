import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useTenant } from "@/store/tenant";
import { useCreateOrder } from "@/data/orders";
import { getProvider, redirectToCheckout } from "@/lib/payment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatZAR } from "@/lib/format";

/**
 * /dev-payfast-test — standalone integration test page. NOT linked from
 * anywhere in the storefront nav; visit the URL directly.
 *
 * Exists so the real PayFast (sandbox) round trip can be exercised
 * end-to-end — browser → checkout-fields route → signed redirect to
 * PayFast's hosted page → pay in sandbox → ITN webhook → /order/:ref
 * shows the updated status — WITHOUT first deciding whether PayFast
 * replaces, supplements, or sequences with the existing WhatsApp
 * checkout flow in src/routes/checkout.tsx. That product decision is
 * still open (see payfast-integration-brief.md).
 *
 * Deliberately NOT gated behind import.meta.env.DEV: this project is
 * deployed via `npm run build && npx wrangler deploy` with no separate
 * staging environment, and the Cloudflare Worker env bindings this
 * needs (SUPABASE_SERVICE_ROLE_KEY) only exist in a build — so testing
 * necessarily happens against a real deployment. Safety instead comes
 * from: (a) it's an unlinked URL, (b) it does nothing unless
 * VITE_PAYMENT_PROVIDER is explicitly set to a non-mock provider at
 * build time, (c) it creates a real order row (visible in Admin →
 * Orders like any other), it's just clearly labelled as a test.
 *
 * Creates a real order (via the same useCreateOrder() hook checkout.tsx
 * uses) with fictional placeholder customer/shipping details, then calls
 * whichever payment provider is active via the same
 * getProvider()/redirectToCheckout() path any real checkout would use.
 */

export const Route = createFileRoute("/dev-payfast-test")({
  component: DevPayfastTest,
});

function DevPayfastTest() {
  const tenant = useTenant();
  const createOrder = useCreateOrder();
  const provider = getProvider();
  const [amount, setAmount] = useState("10.00");
  const [email, setEmail] = useState("test@example.com");
  const [busy, setBusy] = useState(false);

  const providerIsLive = provider.name !== "Mock Gateway (dev only)";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const total = Math.round(parseFloat(amount) * 100) / 100;
      if (!Number.isFinite(total) || total <= 0) {
        throw new Error("Enter a valid amount");
      }

      // Fictional placeholder details — this is a plumbing test, not a
      // real order, so shipping fields are dummy values.
      const order = await createOrder.mutateAsync({
        customerName: "PayFast Test Customer",
        customerEmail: email,
        customerPhone: "",
        shippingAddress: {
          line1: "1 Test Street",
          suburb: "Test Suburb",
          city: "Cape Town",
          postal: "8001",
          province: "Western Cape",
        },
        items: [
          { productSlug: "dev-payfast-test", name: "PayFast sandbox test", size: "-", qty: 1, price: total },
        ],
        subtotal: total,
        shipping: 0,
        vat: 0,
        total,
      });

      const origin = window.location.origin;
      const session = await provider.createCheckoutSession({
        orderReference: order.id,
        amountCents: Math.round(total * 100),
        currency: "ZAR",
        customerEmail: email,
        customerName: "PayFast Test Customer",
        returnUrl: `${origin}/order/${order.id}`,
        cancelUrl: `${origin}/dev-payfast-test`,
      });

      redirectToCheckout(session);
    } catch (err) {
      setBusy(false);
      toast.error("Test checkout failed", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="rounded-t-md bg-primary text-on-primary px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-center">
        ⚠ Integration test tool · creates a real order row · not for customers
      </div>
      <div className="rounded-b-md border border-border bg-surface p-6 space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold mb-1">PayFast test checkout</h1>
          <p className="text-sm text-muted">
            Tenant: <span className="font-mono">{tenant?.slug ?? "resolving…"}</span>
            {" · "}Active provider: <span className="font-mono">{provider.name}</span>
          </p>
        </div>

        {!providerIsLive && (
          <p className="text-sm text-danger border border-danger/30 bg-danger/5 rounded-sm px-3 py-2">
            Active provider is the mock gateway. Set <code>VITE_PAYMENT_PROVIDER=payfast</code>{" "}
            in <code>.env.local</code> and rebuild/redeploy to actually test PayFast — this page
            will still "work" against the mock, but that's not the round trip you're after.
          </p>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (ZAR)</Label>
            <Input
              id="amount"
              type="number"
              min="1"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email (for the sandbox receipt)</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? "Creating test order…" : `Pay ${formatZAR(parseFloat(amount) || 0)} via ${provider.name}`}
          </Button>
        </form>

        <p className="text-[11px] text-muted text-center">
          On success you'll land on /order/:ref, which polls for the ITN-driven status update.
          Check Admin → Orders to confirm the row and its payment_reference afterwards.
        </p>
      </div>
    </div>
  );
}
