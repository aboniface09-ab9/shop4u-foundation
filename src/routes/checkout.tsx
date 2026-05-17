import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useCart, SHIPPING_FLAT, VAT_RATE } from "@/store/cart";
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
  const { items, subtotal } = useCart();
  const sub = subtotal();
  const shipping = items.length ? SHIPPING_FLAT : 0;
  const vat = Math.round((sub + shipping) * VAT_RATE);
  const total = sub + shipping + vat;

  const [province, setProvince] = useState("Western Cape");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Ready for payment", {
      description:
        "In production this hands off to a hosted payment page (Yoco / Peach Payments / Paystack). No real charge — demo build.",
      duration: 6000,
    });
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
              </div>
            </div>
          </Section>

          <Button type="submit" size="lg" className="w-full">Continue to payment</Button>
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
              <Row label="VAT (15%)" value={formatZAR(vat)} />
            </div>
            <div className="border-t border-border mt-4 pt-4 flex justify-between">
              <span className="font-heading font-semibold">Total</span>
              <span className="font-mono font-semibold text-lg">{formatZAR(total)}</span>
            </div>
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
      <Input id={id} {...rest} />
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-muted">{label}</span><span className="font-mono">{value}</span></div>;
}
