import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { useProduct } from "@/data/products";
import { ProductImage } from "@/components/ProductImage";
import { Button } from "@/components/ui/button";
import { useCart } from "@/store/cart";
import { formatZAR } from "@/lib/format";

export const Route = createFileRoute("/product/$id")({
  component: ProductPage,
});

function ProductPage() {
  const { id } = Route.useParams();
  const { data: product, isLoading } = useProduct(id);
  const [size, setSize] = useState<string | undefined>(undefined);
  const add = useCart((s) => s.add);

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

  const handleAdd = () => {
    if (!size) return;
    add({
      id: product.id,
      name: product.name,
      size,
      qty: 1,
      price: product.price,
      imageColor: product.imageColor,
      category: product.category,
    });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-8 py-8 md:py-14">
      <Link
        to="/shop"
        className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted hover:text-text mb-8"
      >
        <ArrowLeft size={14} /> Back to shop
      </Link>

      <div className="grid md:grid-cols-12 gap-10">
        <div className="md:col-span-7">
          <div className="aspect-[4/5] overflow-hidden rounded-lg">
            <ProductImage
              name={product.name}
              category={product.category}
              color={product.imageColor}
              imageUrl={product.imageUrl}
              size="lg"
            />
          </div>
        </div>

        <div className="md:col-span-5 md:pt-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">{product.category}</p>
          <h1 className="font-heading text-4xl md:text-5xl font-semibold mt-2 leading-[0.95]">
            {product.name}
          </h1>
          <p className="mt-4 font-mono text-xl">{formatZAR(product.price)}</p>

          <p className="mt-6 text-muted leading-relaxed">{product.description}</p>

          <div className="mt-8">
            <div className="flex items-center justify-between mb-3">
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

          <Button size="lg" className="w-full mt-8" onClick={handleAdd}>
            <ShoppingBag size={16} className="mr-2" /> Add to bag
          </Button>

          <div className="mt-6 pt-6 border-t border-border space-y-2 text-sm text-muted">
            <p>{product.stock} in stock</p>
            <p>Free shipping in Cape Town over R900</p>
            <p>30-day returns on unworn pieces</p>
          </div>
        </div>
      </div>
    </div>
  );
}
