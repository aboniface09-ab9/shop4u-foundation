import { Link } from "@tanstack/react-router";
import { Minus, Plus, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useCart } from "@/store/cart";
import { ProductImage } from "./ProductImage";
import { formatZAR } from "@/lib/format";
import { buildQuickCartUrl } from "@/lib/whatsapp";

export function CartDrawer() {
  const { items, isOpen, close, setQty, remove, subtotal } = useCart();

  return (
    <Sheet open={isOpen} onOpenChange={(v) => !v && close()}>
      <SheetContent className="w-full sm:max-w-md flex flex-col bg-bg border-l border-border p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <SheetTitle className="font-heading text-xl">Your bag</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-20">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
                Your bag is empty
              </p>
              <Button asChild variant="outline" className="mt-6" onClick={close}>
                <Link to="/shop">Browse the shop</Link>
              </Button>
            </div>
          ) : (
            <ul className="space-y-5">
              {items.map((item) => (
                <li key={item.id + item.size} className="flex gap-4">
                  <div className="h-24 w-20 shrink-0 overflow-hidden rounded-sm">
                    <ProductImage
                      name={item.name}
                      category={item.category}
                      color={item.imageColor}
                      size="sm"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-2">
                      <h4 className="font-heading font-semibold leading-tight">{item.name}</h4>
                      <button
                        onClick={() => remove(item.id, item.size)}
                        aria-label="Remove"
                        className="text-muted hover:text-danger"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted mt-0.5">
                      Size {item.size}
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center border border-border rounded-sm">
                        <button
                          className="p-1.5 hover:bg-surface"
                          onClick={() => setQty(item.id, item.size, item.qty - 1)}
                          aria-label="Decrease"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="px-3 font-mono text-sm">{item.qty}</span>
                        <button
                          className="p-1.5 hover:bg-surface"
                          onClick={() => setQty(item.id, item.size, item.qty + 1)}
                          aria-label="Increase"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                      <span className="font-mono text-sm">{formatZAR(item.price * item.qty)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-border p-6 space-y-4 bg-surface">
            <div className="flex justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
                Subtotal
              </span>
              <span className="font-mono font-semibold">{formatZAR(subtotal())}</span>
            </div>
            <p className="text-xs text-muted">Shipping and VAT calculated at checkout.</p>
            {/* Primary CTA — full checkout form, saves order to Supabase */}
            <Button asChild className="w-full" size="lg" onClick={close}>
              <Link to="/checkout">Place order via WhatsApp</Link>
            </Button>
            {/* Quick shortcut — skips the form, sends basket items directly */}
            <button
              className="w-full text-center font-mono text-[11px] uppercase tracking-[0.18em] text-muted hover:text-primary transition-colors"
              onClick={() => {
                const url = buildQuickCartUrl(
                  items.map((i) => ({ name: i.name, size: i.size, qty: i.qty, price: i.price })),
                );
                window.open(url, "_blank", "noopener,noreferrer");
              }}
            >
              Quick enquiry on WhatsApp
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
