import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { useProduct } from "@/data/products";
import { ProductImage } from "@/components/ProductImage";
import { Button } from "@/components/ui/button";
import { useCart } from "@/store/cart";
import { useTenant } from "@/store/tenant";
import { formatZAR } from "@/lib/format";

export const Route = createFileRoute("/product/$id")({
  component: ProductPage,
});

function ProductPage() {
  const { id } = Route.useParams();
  const { data: product, isLoading } = useProduct(id);
  const [size, setSize] = useState<string | undefined>(undefined);
  const add = useCart((s) => s.add);
  const tenant = useTenant();
  const vatRegistered = tenant?.vat_registered ?? true;

  // Pick the first size as default once the product loads.
  useEffect(() => {
    if (product && !size) setSize(product.sizes[0]);
  }, [product, size]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-32 text-center text-muted">
        Loading…
      </div>
    );
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-32 text-center">
        <h1 className="font-heading text-4xl font-semibold">Product not found</h1>
        <Link to="/shop" className="text-primary underline mt-4 inline-block">
          Back to shop
        </Link>
      </div>
    );
  }

  // Only show the size picker when there's a real choice to make. A
  // single size (including a placeholder like "One Size") isn't a
  // choice, so pool cleaners etc. skip the Size / Size guide UI entirely.
  const hasSizes = product.sizes.length > 1;

  const handleAdd = () => {
    // Products with no sizes configured (pool chemicals, supplies, etc.
    // rather than apparel) don't need a size selection to add to cart.
    if (hasSizes && !size) return;
    add({
      id: product.id,
      name: product.name,
      size: size ?? "Standard",
      qty: 1,
      price: product.price,
      imageColor: product.imageColor,
      imageUrl: product.imageUrl,
      category: product.category,
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-8 py-6 md:py-8">
      <Link
        to="/shop"
        className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted hover:text-text mb-4"
      >
        <ArrowLeft size={14} /> Back to shop
      </Link>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="mx-auto w-full max-w-md md:max-w-none">
          <div className="aspect-square max-h-[60vh] overflow-hidden rounded-lg">
            <ProductImage
              name={product.name}
              category={product.category}
              color={product.imageColor}
              imageUrl={product.imageUrl}
              size="lg"
            />
          </div>
        </div>

        <div className="md:pt-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">{product.category}</p>
          <h1 className="font-heading text-2xl md:text-3xl font-semibold mt-1 leading-tight">
            {product.name}
          </h1>
          <p className="mt-2 font-mono text-lg">
            {formatZAR(product.price)}
            {vatRegistered && <span className="text-muted text-xs ml-2 font-sans">incl. VAT</span>}
          </p>

          <p className="mt-3 text-muted text-sm leading-relaxed">{product.description}</p>

          {hasSizes && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">Size</span>
                <button className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted underline">
                  Size guide
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {product.sizes.map((s: string) => (
                  <button
                    key={s}
                    onClick={() => setSize(s)}
                    className={`min-w-[3.25rem] px-3 py-2.5 font-mono text-sm rounded-sm border transition-colors ${
                      size === s
                        ? "border-text bg-text text-bg"
                        : "border-border hover:border-muted"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Button size="lg" className="w-full mt-4" onClick={handleAdd}>
            <ShoppingBag size={16} className="mr-2" /> Add to bag
          </Button>

          <div className="mt-4 pt-4 border-t border-border space-y-2 text-sm text-muted">
            <p>{product.stock} in stock</p>
          </div>
        </div>
      </div>
    </div>
  );
}
