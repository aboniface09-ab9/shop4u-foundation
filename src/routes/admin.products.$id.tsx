import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  useProduct,
  useUpdateProduct,
  useArchiveProduct,
} from "@/data/products";
import { ImageUpload } from "@/components/ImageUpload";
import { CategoryCombobox } from "@/components/CategoryCombobox";
import { useTenantId } from "@/store/tenant";

export const Route = createFileRoute("/admin/products/$id")({
  component: EditProduct,
});

const ALL_SIZES = ["XS", "S", "M", "L", "XL", "One Size", "28", "30", "32", "34", "36"];
function EditProduct() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: product, isLoading } = useProduct(id);
  const updateProduct = useUpdateProduct();
  const archiveProduct = useArchiveProduct();
  const tenantId = useTenantId();

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [sizes, setSizes] = useState<string[]>([]);
  const [stock, setStock] = useState("");
  const [imageColor, setImageColor] = useState("#1A1714");
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // Populate form once product loads
  useEffect(() => {
    if (!product) return;
    setName(product.name);
    setCategory(product.category);
    setPrice(String(product.price));
    setDescription(product.description);
    setSizes(product.sizes);
    setStock(String(product.stock));
    setImageColor(product.imageColor);
    setImageUrl(product.imageUrl ?? null);
  }, [product]);

  const toggle = (s: string) =>
    setSizes((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProduct.mutateAsync({
        slug: id,
        name: name.trim(),
        description: description.trim(),
        category,
        priceCents: Math.round(parseFloat(price) * 100),
        sizes,
        stock: parseInt(stock) || 0,
        imageColor: imageColor || "#1A1714",
        imageUrl,
      });
      toast.success("Product updated");
      navigate({ to: "/admin/products" });
    } catch (err) {
      toast.error("Failed to update product", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  const archive = async () => {
    try {
      await archiveProduct.mutateAsync(id);
      toast.success("Product archived");
      navigate({ to: "/admin/products" });
    } catch (err) {
      toast.error("Failed to archive product", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  if (isLoading) {
    return <div className="p-10 text-muted">Loading…</div>;
  }

  if (!product) {
    return (
      <div className="p-10">
        <p className="text-muted">Product not found.</p>
        <Link to="/admin/products" className="mt-4 inline-block text-sm underline">
          Back to products
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-3xl">
      <Link
        to="/admin/products"
        className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted hover:text-text mb-6"
      >
        <ArrowLeft size={14} /> Products
      </Link>
      <h1 className="font-heading text-3xl font-semibold mb-8">Edit product</h1>

      <form onSubmit={submit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
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
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="color">Image colour (hex)</Label>
            <Input
              id="color"
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
              slug={id}
              currentUrl={imageUrl}
              onUpload={(url) => setImageUrl(url)}
              onRemove={() => setImageUrl(null)}
            />
          ) : (
            <p className="text-xs text-muted">Loading tenant…</p>
          )}
          <p className="text-xs text-muted">
            Upload a photo and it replaces the colour gradient on the storefront.
          </p>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div className="flex gap-3">
            <Button type="submit" size="lg" disabled={updateProduct.isPending}>
              {updateProduct.isPending ? "Saving…" : "Save changes"}
            </Button>
            <Button type="button" asChild variant="outline" size="lg">
              <Link to="/admin/products">Cancel</Link>
            </Button>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" size="lg" className="text-danger border-danger/30 hover:bg-danger/10">
                <Trash2 size={14} className="mr-2" /> Archive
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Archive this product?</AlertDialogTitle>
                <AlertDialogDescription>
                  The product will be removed from the storefront immediately. You can restore it later by updating its status in Supabase.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={archive}
                  className="bg-danger text-white hover:bg-danger/90"
                >
                  Archive
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </form>
    </div>
  );
}
