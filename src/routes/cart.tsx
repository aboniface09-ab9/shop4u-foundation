import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, X } from "lucide-react";
import { useCart, SHIPPING_FLAT, VAT_RATE } from "@/store/cart";
import { ProductImage } from "@/components/ProductImage";
import { Button } from "@/components/ui/button";
import { formatZAR } from "@/lib/format";

export const Route = createFileRoute("/cart")({
  component: CartPage,
});

function CartPage() {
  const { items, setQty, remove, subtotal } = useCart();
  const sub = subtotal();
  const shipping = items.length ? SHIPPING_FLAT : 0;
  const vat = Math.round((sub + shipping) * VAT_RATE);
  const total = sub + shipping + vat;

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-32 text-center">
        <h1 className="font-heading text-4xl font-semibold">Your bag is empty</h1>
        <p className="text-muted mt-3">Add a piece or two and come back.</p>
        <Button asChild className="mt-8"><Link to="/shop">Browse the shop</Link></Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-8 py-10 md:py-16">
      <h1 className="font-heading text-4xl md:text-5xl font-semibold mb-10">Your bag</h1>
      <div className="grid md:grid-cols-12 gap-10">
        <ul className="md:col-span-8 divide-y divide-border border-y border-border">
          {items.map((i) => (
            <li key={i.id + i.size} className="flex gap-5 py-6">
              <div className="h-32 w-24 shrink-0 overflow-hidden rounded-sm">
                <ProductImage name={i.name} category={i.category} color={i.imageColor} size="sm" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between">
                  <h3 className="font-heading font-semibold text-lg">{i.name}</h3>
                  <button onClick={() => remove(i.id, i.size)} className="text-muted hover:text-danger">
                    <X size={18} />
                  </button>
                </div>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted mt-1">Size {i.size}</p>
                <div className="mt-6 flex items-center justify-between">
                  <div className="flex items-center border border-border rounded-sm">
                    <button className="p-2 hover:bg-surface" onClick={() => setQty(i.id, i.size, i.qty - 1)}><Minus size={12} /></button>
                    <span className="px-4 font-mono">{i.qty}</span>
                    <button className="p-2 hover:bg-surface" onClick={() => setQty(i.id, i.size, i.qty + 1)}><Plus size={12} /></button>
                  </div>
                  <span className="font-mono">{formatZAR(i.price * i.qty)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <aside className="md:col-span-4">
          <div className="rounded-md border border-border bg-surface p-6">
            <h2 className="font-heading text-xl font-semibold mb-4">Summary</h2>
            <dl className="space-y-2 text-sm">
              <Row label="Subtotal" value={formatZAR(sub)} />
              <Row label="Shipping" value={formatZAR(shipping)} />
              <Row label="VAT (15%)" value={formatZAR(vat)} />
            </dl>
            <div className="border-t border-border mt-4 pt-4 flex justify-between">
              <span className="font-heading font-semibold">Total</span>
              <span className="font-mono font-semibold text-lg">{formatZAR(total)}</span>
            </div>
            <Button asChild size="lg" className="w-full mt-6"><Link to="/checkout">Checkout</Link></Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
