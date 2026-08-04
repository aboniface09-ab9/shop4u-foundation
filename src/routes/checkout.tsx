import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useCart, SHIPPING_FLAT, calcOrderTotals } from "@/store/cart";
import { useTenant } from "@/store/tenant";
import { useCreateOrder } from "@/data/orders";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { getProvider, redirectToCheckout } from "@/lib/payment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatZAR } from "@/lib/format";

export const Route = createFileRoute("/checkout")({
  component: Checkout,
});

const PROVINCES = [
  "Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo",
  "Mpumalanga", "Northern Cape", "North West", "Western Cape",
];

function Checkout() {
  const { items, subtotal, clear } = useCart();
  const tenant = useTenant();
  const vatRegistered = tenant?.vat_registered ?? true;
  const sub = subtotal();
  const shipping = items.length ? SHIPPING_FLAT : 0;
  // Listed prices are VAT-inclusive — vat is the extracted portion of the
  // total, never an add-on. Not-VAT-registered tenants get vat = 0.
  const { vat, total } = calcOrderTotals(sub, shipping, vatRegistered);

  const [province, setProvince] = useState("Western Cape");
  const [busy, setBusy] = useState(false);
  const createOrder = useCreateOrder();

  // PayFast (or whichever provider is active) — the "Pay by card" button
  // needs BOTH: (1) a real provider active at build time
  // (VITE_PAYMENT_PROVIDER, defaults to the mock gateway so this stays
  // hidden everywhere until explicitly turned on), AND (2) this specific
  // tenant opted in (tenants.payfast_enabled). That second check is what
  // scopes the button to only the tenant(s) that actually have a
  // tenant_payfast_config row set up — deploying the provider flag no
  // longer lights this up on every storefront.
  const provider = getProvider();
  const providerIsLive = provider.name !== "Mock Gateway (dev only)" && !!tenant?.payfast_enabled;

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const payByCard = submitter?.value === "card";

    setBusy(true);

    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const mobile = String(form.get("mobile") ?? "");
    const firstName = String(form.get("firstName") ?? "");
    const lastName = String(form.get("lastName") ?? "");
    const address = String(form.get("address") ?? "");
    const suburb = String(form.get("suburb") ?? "");
    const city = String(form.get("city") ?? "");
    const postal = String(form.get("postal") ?? "");
    const customerName = `${firstName} ${lastName}`.trim();

    try {
      // 1. Create the pending order in Supabase so we have a record.
      const order = await createOrder.mutateAsync({
        customerName,
        customerEmail: email,
        customerPhone: mobile,
        shippingAddress: { line1: address, suburb, city, postal, province },
        items: items.map((i) => ({
          productSlug: i.id,
          name: i.name,
          size: i.size,
          qty: i.qty,
          price: i.price,
        })),
        subtotal: sub,
        shipping,
        vat,
        total,
      });

      if (payByCard) {
        // 2a. Card path: ask the active provider for a hosted checkout
        // session, then send the browser there. The order stays "pending"
        // until PayFast's ITN webhook confirms payment server-side (see
        // payfast-integration-brief.md) — /order/:ref polls for that.
        const origin = window.location.origin;
        const session = await provider.createCheckoutSession({
          orderReference: order.id,
          amountCents: Math.round(total * 100),
          currency: "ZAR",
          customerEmail: email,
          customerName,
          returnUrl: `${origin}/order/${order.id}`,
          cancelUrl: `${origin}/checkout`,
        });
        clear();
        redirectToCheckout(session);
        return;
      }

      // 2b. WhatsApp path (unchanged): build a pre-filled message and open it.
      const waUrl = buildWhatsAppUrl({
        orderRef: order.id,
        items: items.map((i) => ({ name: i.name, size: i.size, qty: i.qty, price: i.price })),
        customer: { name: customerName, email, phone: mobile },
        shipping: { line1: address, suburb, city, postal, province },
        whatsappNumber: tenant?.whatsapp_number,
        vatRegistered,
      });

      // 3. Clear cart, then open WhatsApp in a new tab.
      clear();
      window.open(waUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setBusy(false);
      toast.error("Something went wrong", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  };

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-32 text-center">
        <h1 className="font-heading text-3xl font-semibold">Your bag is empty</h1>
        <Button asChild className="mt-8"><Link to="/shop">Back to shop</Link></Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-8 py-10 md:py-16">
      <h1 className="font-heading text-4xl md:text-5xl font-semibold mb-10">Checkout</h1>
      <form onSubmit={submit} className="grid md:grid-cols-12 gap-10">
        <div className="md:col-span-7 space-y-8">
          <Section title="Contact">
            <Field id="email" label="Email" type="email" required />
            <Field id="mobile" label="Mobile" type="tel" placeholder="+27 …" required />
          </Section>

          <Section title="Shipping address">
            <div className="grid grid-cols-2 gap-3">
              <Field id="firstName" label="First name" required />
              <Field id="lastName" label="Last name" required />
            </div>
            <Field id="address" label="Address" required />
            <div className="grid grid-cols-2 gap-3">
              <Field id="suburb" label="Suburb" required />
              <Field id="city" label="City" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field id="postal" label="Postal code" required />
              <div className="space-y-2">
                <Label htmlFor="province">Province</Label>
                <Select value={province} onValueChange={setProvince}>
                  <SelectTrigger id="province"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROVINCES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
                {/* Hidden field so FormData picks up the province value */}
                <input type="hidden" name="province" value={province} />
              </div>
            </div>
          </Section>

          {providerIsLive && (
            <Button
              type="submit"
              name="action"
              value="card"
              size="lg"
              className="w-full"
              disabled={busy}
            >
              {busy ? "Redirecting to payment…" : `Pay ${formatZAR(total)} by card`}
            </Button>
          )}

          <Button
            type="submit"
            name="action"
            value="whatsapp"
            size="lg"
            variant={providerIsLive ? "outline" : "default"}
            className="w-full"
            disabled={busy}
          >
            {busy ? "Opening WhatsApp…" : "Place order via WhatsApp"}
          </Button>

          <p className="text-[11px] text-muted text-center">
            {providerIsLive
              ? "Pay by card now, or place your order via WhatsApp and arrange payment with the team directly."
              : "We'll open WhatsApp with your full order summary. One of the team will confirm availability and arrange payment with you directly."}
          </p>
        </div>

        <aside className="md:col-span-5">
          <div className="rounded-md border border-border bg-surface p-6 sticky top-24">
            <h2 className="font-heading text-xl font-semibold mb-4">Your order</h2>
            <ul className="space-y-3 mb-4 text-sm">
              {items.map((i) => (
                <li key={i.id + i.size} className="flex justify-between gap-2">
                  <span>{i.name} <span className="text-muted">· {i.size} × {i.qty}</span></span>
                  <span className="font-mono">{formatZAR(i.price * i.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-border pt-4 space-y-2 text-sm">
              <Row label="Subtotal" value={formatZAR(sub)} />
              <Row label="Shipping" value={formatZAR(shipping)} />
            </div>
            <div className="border-t border-border mt-4 pt-4 flex justify-between">
              <span className="font-heading font-semibold">Total</span>
              <span className="font-mono font-semibold text-lg">{formatZAR(total)}</span>
            </div>
            {vatRegistered && (
              <p className="text-[11px] text-muted mt-1.5">Includes VAT (15%): {formatZAR(vat)}</p>
            )}
          </div>
        </aside>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-heading text-xl font-semibold mb-4">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
function Field({ id, label, ...rest }: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} {...rest} />
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-muted">{label}</span><span className="font-mono">{value}</span></div>;
}
