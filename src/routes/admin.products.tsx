import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { products } from "@/data/products";
import { ProductImage } from "@/components/ProductImage";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatZAR } from "@/lib/format";

export const Route = createFileRoute("/admin/products")({
  component: ProductsAdmin,
});

function ProductsAdmin() {
  return (
    <div className="p-6 md:p-10 max-w-7xl">
      <header className="flex justify-between items-end mb-8">
        <div>
          <h1 className="font-heading text-3xl font-semibold">Products</h1>
          <p className="text-muted text-sm">{products.length} live products</p>
        </div>
        <Button asChild>
          <Link to="/admin/products/new"><Plus size={16} className="mr-2" /> New product</Link>
        </Button>
      </header>

      <div className="rounded-md border border-border bg-surface overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead></TableHead>
              <TableHead>Product</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="h-12 w-10 overflow-hidden rounded-sm">
                    <ProductImage name={p.name} category={p.category} color={p.imageColor} size="sm" />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted font-mono uppercase tracking-[0.15em]">{p.category}</div>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted">{p.id.toUpperCase()}</TableCell>
                <TableCell className="font-mono">{formatZAR(p.price)}</TableCell>
                <TableCell className={`font-mono ${p.stock < 10 ? "text-danger" : ""}`}>{p.stock}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.16em] bg-success/10 text-success border-success/30">
                    Active
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
