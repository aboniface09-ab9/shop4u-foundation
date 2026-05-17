import { createFileRoute } from "@tanstack/react-router";
import { TrendingUp, ShoppingBag, Package, AlertTriangle } from "lucide-react";
import { orders } from "@/data/orders";
import { products } from "@/data/products";
import { formatZAR, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/")({
  component: Dashboard,
});

function Dashboard() {
  const revenue = orders.filter((o) => o.status === "paid" || o.status === "fulfilled").reduce((a, o) => a + o.total, 0);
  const lowStock = products.filter((p) => p.stock < 10);

  return (
    <div className="p-6 md:p-10 max-w-7xl">
      <h1 className="font-heading text-3xl font-semibold mb-1">Dashboard</h1>
      <p className="text-muted text-sm mb-8">Last 30 days · all currencies in ZAR</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <Stat icon={TrendingUp} label="Revenue" value={formatZAR(revenue)} delta="+12.4%" />
        <Stat icon={ShoppingBag} label="Orders" value={String(orders.length)} delta="+3" />
        <Stat icon={Package} label="Products live" value={String(products.length)} delta="" />
        <Stat icon={AlertTriangle} label="Low stock" value={String(lowStock.length)} delta="needs review" warn />
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <Panel title="Recent orders">
          <ul className="divide-y divide-border">
            {orders.slice(0, 5).map((o) => (
              <li key={o.id} className="py-3 flex justify-between items-center">
                <div>
                  <div className="font-mono text-sm">{o.id}</div>
                  <div className="text-xs text-muted">{o.customer} · {formatDate(o.date)}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono">{formatZAR(o.total)}</div>
                  <StatusBadge status={o.status} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Low stock">
          {lowStock.length === 0 ? (
            <p className="text-muted text-sm">All products comfortably stocked.</p>
          ) : (
            <ul className="divide-y divide-border">
              {lowStock.map((p) => (
                <li key={p.id} className="py-3 flex justify-between items-center">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted font-mono uppercase tracking-[0.15em]">{p.category}</div>
                  </div>
                  <div className="font-mono text-sm text-danger">{p.stock} left</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, delta, warn }: { icon: React.ComponentType<{ size?: number }>; label: string; value: string; delta: string; warn?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-surface p-5">
      <div className="flex items-center justify-between text-muted">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em]">{label}</span>
        <Icon size={14} />
      </div>
      <div className="font-heading text-2xl font-semibold mt-2">{value}</div>
      {delta && <div className={`text-xs mt-1 ${warn ? "text-danger" : "text-muted"}`}>{delta}</div>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-surface p-5">
      <h2 className="font-heading font-semibold mb-3">{title}</h2>
      {children}
    </section>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: "bg-success/15 text-success border-success/30",
    fulfilled: "bg-accent/15 text-accent border-accent/30",
    pending: "bg-muted/15 text-muted border-border",
    refunded: "bg-danger/15 text-danger border-danger/30",
    cancelled: "bg-muted/10 text-muted border-border",
  };
  return (
    <Badge variant="outline" className={`mt-1 font-mono text-[10px] uppercase tracking-[0.16em] ${map[status] || ""}`}>
      {status}
    </Badge>
  );
}
