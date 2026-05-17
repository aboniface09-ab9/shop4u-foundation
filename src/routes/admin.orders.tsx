import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { orders, OrderStatus } from "@/data/orders";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatZAR, formatDate } from "@/lib/format";
import { StatusBadge } from "./admin.index";

export const Route = createFileRoute("/admin/orders")({
  component: OrdersAdmin,
});

const STATUSES: ("all" | OrderStatus)[] = ["all", "pending", "paid", "fulfilled", "refunded", "cancelled"];

function OrdersAdmin() {
  const [filter, setFilter] = useState<"all" | OrderStatus>("all");
  const list = orders.filter((o) => filter === "all" || o.status === filter);

  return (
    <div className="p-6 md:p-10 max-w-7xl">
      <header className="mb-8">
        <h1 className="font-heading text-3xl font-semibold">Orders</h1>
        <p className="text-muted text-sm">{orders.length} total · {orders.filter(o => o.status === "pending").length} pending fulfilment</p>
      </header>

      <div className="flex flex-wrap gap-1 mb-5">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] rounded-sm border ${
              filter === s ? "bg-text text-bg border-text" : "border-border text-muted hover:text-text"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="rounded-md border border-border bg-surface overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-sm">{o.id}</TableCell>
                <TableCell>{o.customer}</TableCell>
                <TableCell className="text-muted text-sm">{o.items.reduce((a, i) => a + i.qty, 0)}</TableCell>
                <TableCell className="text-muted text-sm">{formatDate(o.date)}</TableCell>
                <TableCell className="font-mono">{formatZAR(o.total)}</TableCell>
                <TableCell><StatusBadge status={o.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {list.length === 0 && <p className="p-8 text-center text-muted">No orders match this filter.</p>}
      </div>
    </div>
  );
}
