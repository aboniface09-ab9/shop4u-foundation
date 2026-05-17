import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/products/new")({
  component: NewProduct,
});

const ALL_SIZES = ["XS", "S", "M", "L", "XL", "One Size", "28", "30", "32", "34", "36"];

function NewProduct() {
  const [sizes, setSizes] = useState<string[]>([]);

  const toggle = (s: string) => setSizes((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Product saved (demo)", { description: "Real product creation lands once Cloud is wired up." });
  };

  return (
    <div className="p-6 md:p-10 max-w-3xl">
      <Link to="/admin/products" className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted hover:text-text mb-6">
        <ArrowLeft size={14} /> Products
      </Link>
      <h1 className="font-heading text-3xl font-semibold mb-8">New product</h1>

      <form onSubmit={submit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" placeholder="Heritage Hoodie" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="cat">Category</Label>
            <Select defaultValue="Tops">
              <SelectTrigger id="cat"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Tops", "Bottoms", "Headwear", "Accessories"].map((c) =>
                  <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="price">Price (ZAR)</Label>
            <Input id="price" type="number" placeholder="1290" required />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="desc">Description</Label>
          <textarea
            id="desc"
            className="w-full min-h-[120px] rounded-sm border border-border bg-bg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            placeholder="What makes this piece worth keeping?"
          />
        </div>

        <div className="space-y-2">
          <Label>Sizes</Label>
          <div className="flex flex-wrap gap-2">
            {ALL_SIZES.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => toggle(s)}
                className={`px-3 py-1.5 font-mono text-xs rounded-sm border ${
                  sizes.includes(s)
                    ? "bg-text text-bg border-text"
                    : "border-border text-muted hover:text-text"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="stock">Stock</Label>
            <Input id="stock" type="number" placeholder="24" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="color">Image colour (hex)</Label>
            <Input id="color" placeholder="#C25E2B" />
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-border">
          <Button type="submit" size="lg">Save product</Button>
          <Button type="button" asChild variant="outline" size="lg">
            <Link to="/admin/products">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
