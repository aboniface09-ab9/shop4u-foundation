import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateProduct } from "@/data/products";
import { CategoryCombobox } from "@/components/CategoryCombobox";
import { ImageUpload } from "@/components/ImageUpload";
import { useTenantId } from "@/store/tenant";
import { slugify } from "@/lib/utils";

export const Route = createFileRoute("/admin/products/new")({
  component: NewProduct,
});

const ALL_SIZES = ["XS", "S", "M", "L", "XL", "One Size", "28", "30", "32", "34", "36"];

function NewProduct() {
  const navigate = useNavigate();
  const createProduct = useCreateProduct();
  const tenantId = useTenantId();

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [sizes, setSizes] = useState<string[]>([]);
  const [stock, setStock] = useState("");
  // Mid-tone default (not near-black or near-white) so the gradient
  // placeholder stays visible against every theme, including the dark
  // ones — a near-black default used to disappear into Onyx/Volt bg.
  const [imageColor, setImageColor] = useState("#3D7A8A");
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const toggle = (s: string) =>
    setSizes((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createProduct.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        category,
        priceCents: Math.round(parseFloat(price) * 100),
        sizes,
        stock: parseInt(stock) || 0,
        imageColor: imageColor || "#3D7A8A",
        imageUrl,
      });
      toast.success("Product saved");
      navigate({ to: "/admin/products" });
    } catch (err) {
      toast.error("Failed to save product", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-3xl">
      <Link
        to="/admin/products"
        className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted hover:text-text mb-6"
      >
        <ArrowLeft size={14} /> Products
      </Link>
      <h1 className="font-heading text-3xl font-semibold mb-8">New product</h1>

      <form onSubmit={submit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            placeholder="Heritage Hoodie"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Category</Label>
            <CategoryCombobox value={category} onChange={setCategory} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="price">Price (ZAR)</Label>
            <Input
              id="price"
              type="number"
              min="0"
              step="0.01"
              placeholder="1290"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="desc">Description</Label>
          <textarea
            id="desc"
            className="w-full min-h-[120px] rounded-sm border border-border bg-bg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            placeholder="What makes this piece worth keeping?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
            <Input
              id="stock"
              type="number"
              min="0"
              placeholder="24"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="color">Fallback colour (hex)</Label>
            <Input
              id="color"
              placeholder="#C25E2B"
              value={imageColor}
              onChange={(e) => setImageColor(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Product image</Label>
          {tenantId ? (
            <ImageUpload
              tenantId={tenantId}
              slug={slugify(name) || "new-product"}
              currentUrl={imageUrl}
              onUpload={(url) => setImageUrl(url)}
              onRemove={() => setImageUrl(null)}
            />
          ) : (
            <p className="text-xs text-muted">Loading tenant…</p>
          )}
          <p className="text-xs text-muted">
            Upload a photo and it replaces the colour gradient on the storefront.
            If no photo, the gradient is used as the placeholder.
          </p>
        </div>

        <div className="flex gap-3 pt-4 border-t border-border">
          <Button type="submit" size="lg" disabled={createProduct.isPending}>
            {createProduct.isPending ? "Saving…" : "Save product"}
          </Button>
          <Button type="button" asChild variant="outline" size="lg">
            <Link to="/admin/products">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
