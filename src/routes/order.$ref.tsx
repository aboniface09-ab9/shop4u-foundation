import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, XCircle, RotateCcw, Truck } from "lucide-react";

import { supabase, type OrderRow } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { formatZAR } from "@/lib/format";

/**
 * /order/:ref — post-checkout status page.
 *
 * The customer lands here after the gateway redirects them back. We
 * read the order from Supabase by its order_number (e.g. "FND-1043")
 * and render whichever state it's in: paid (success), pending (still
 * waiting for the gateway), cancelled, or refunded.
 *
 * Bookmarkable, shareable, polled every few seconds while pending so
 * webhook-driven status updates appear without a manual refresh.
 */

export const Route = createFileRoute("/order/$ref")({
  component: OrderStatus,
});

function OrderStatus() {
  const { ref } = Route.useParams();

  const { data: order, isLoading } = useQuery({
    queryKey: ["order", ref],
    queryFn: async (): Promise<OrderRow | null> => {
      // Uses the SECURITY DEFINER RPC so anonymous customers can read
      // their own order by reference without opening up direct SELECT
      // on the orders table.
      const { data, error } = await supabase.rpc("get_order_by_reference", {
        p_ref: ref,
      });
      if (error) throw error;
      return (data?.[0] as OrderRow | undefined) ?? null;
    },
    // While pending, poll so the page updates when the webhook lands.
    refetchInterval: (q) => {
      const o = q.state.data as OrderRow | null | undefined;
      return o?.status === "pending" ? 3000 : false;
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-md py-32 text-center text-muted">Loading…</div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-md py-32 text-center">
        <h1 className="font-heading text-2xl font-semibold">Order not found</h1>
        <p className="text-muted mt-2">We couldn&apos;t find an order with reference {ref}.</p>
        <Button asChild className="mt-6"><Link to="/shop">Back to shop</Link></Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 md:py-20">
      <StatusHeader status={order.status} reference={order.order_number} />

      <div className="mt-10 rounded-md border border-border bg-surface p-6 space-y-4">
        <h2 className="font-heading text-lg font-semibold">Order summary</h2>

        <ul className="space-y-3 text-sm">
          {order.items.map((i, idx) => (
            <li key={idx} className="flex justify-between">
              <span>
                {i.name}{" "}
                <span className="text-muted">· {i.size} × {i.qty}</span>
              </span>
              <span className="font-mono">{formatZAR((i.price_cents * i.qty) / 100)}</span>
            </li>
          ))}
        </ul>

        <div className="border-t border-border pt-3 space-y-2 text-sm">
          <Row label="Subtotal" value={formatZAR(order.subtotal_cents / 100)} />
          <Row label="Shipping" value={formatZAR(order.shipping_cents / 100)} />
          <Row label="VAT" value={formatZAR(order.vat_cents / 100)} />
        </div>
        <div className="border-t border-border pt-3 flex justify-between font-mono font-semibold">
          <span>Total</span>
          <span>{formatZAR(order.total_cents / 100)}</span>
        </div>
      </div>

      <div className="mt-6 text-sm text-muted">
        <p>A confirmation email is on its way to <strong>{order.customer_email}</strong>.</p>
      </div>

      <div className="mt-8 flex gap-3">
        <Button asChild><Link to="/shop">Keep shopping</Link></Button>
      </div>
    </div>
  );
}

function StatusHeader({ status, reference }: { status: OrderRow["status"]; reference: string }) {
  const cfg = {
    paid:       { icon: CheckCircle2, color: "text-success", label: "Payment received", line: "Thanks — your order is confirmed." },
    pending:    { icon: Clock,        color: "text-muted",   label: "Awaiting confirmation", line: "We're waiting for the payment provider to confirm. This usually takes a few seconds." },
    fulfilled:  { icon: Truck,        color: "text-accent",  label: "On its way",        line: "Your order has shipped." },
    refunded:   { icon: RotateCcw,    color: "text-danger",  label: "Refunded",          line: "This order has been refunded." },
    cancelled:  { icon: XCircle,      color: "text-danger",  label: "Cancelled",         line: "This order was cancelled." },
  }[status];

  const Icon = cfg.icon;
  return (
    <div>
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">{reference}</div>
      <div className="mt-3 flex items-start gap-3">
        <Icon size={28} className={cfg.color} />
        <div>
          <h1 className="font-heading text-3xl md:text-4xl font-semibold leading-tight">{cfg.label}</h1>
          <p className="text-muted mt-2">{cfg.line}</p>
        </div>
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
