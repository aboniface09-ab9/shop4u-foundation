import { createFileRoute } from "@tanstack/react-router";
import { useOrders } from "@/data/orders";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatZAR } from "@/lib/format";

export const Route = createFileRoute("/admin/customers")({
  component: CustomersAdmin,
});

function CustomersAdmin() {
  const { data: orders = [] } = useOrders();
  // Group orders by customer (no real customer table yet — derived from orders).
  const map = new Map<string, { name: string; count: number; spend: number }>();
  for (const o of orders) {
    const prev = map.get(o.customer) ?? { name: o.customer, count: 0, spend: 0 };
    prev.count += 1;
    prev.spend += o.total;
    map.set(o.customer, prev);
  }
  const customers = [...map.values()].sort((a, b) => b.spend - a.spend);

  return (
    <div className="p-6 md:p-10 max-w-7xl">
      <header className="mb-8">
        <h1 className="font-heading text-3xl font-semibold">Customers</h1>
        <p className="text-muted text-sm">{customers.length} customers · derived from orders</p>
      </header>

      <div className="rounded-md border border-border bg-surface overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Orders</TableHead>
              <TableHead>Lifetime spend</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((c) => (
              <TableRow key={c.name}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="font-mono">{c.count}</TableCell>
                <TableCell className="font-mono">{formatZAR(c.spend)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
