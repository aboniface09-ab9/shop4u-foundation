import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";

import type { Product } from "@/data/products";
import { ProductImage } from "@/components/ProductImage";

const ROTATE_MS = 4500;

/**
 * Homepage hero image. Shows a single static product image when there's
 * only one to show (unchanged behaviour), or auto-rotates through several
 * merchant-selected products with a fade transition and click-through dots
 * when there's more than one.
 *
 * Which products (and in what order) come from `tenant.content.hero_product_slugs`,
 * set in Admin → Settings → Homepage hero. See src/routes/index.tsx for how
 * the list is resolved.
 */
export function HeroCarousel({ products }: { products: Product[] }) {
  const [index, setIndex] = useState(0);

  // Reset to the first slide if the underlying product list changes
  // (e.g. merchant edits their selection) so we never point past the end.
  useEffect(() => {
    setIndex(0);
  }, [products.length]);

  useEffect(() => {
    if (products.length < 2) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % products.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [products.length]);

  if (products.length === 0) {
    return <div className="block aspect-[4/3] md:max-h-[440px] overflow-hidden rounded-lg bg-surface" />;
  }

  return (
    <div className="relative aspect-[4/3] md:max-h-[440px] overflow-hidden rounded-lg">
      {products.map((p, i) => (
        <Link
          key={p.id}
          to="/product/$id"
          params={{ id: p.id }}
          className="absolute inset-0 block transition-opacity duration-700"
          style={{ opacity: i === index ? 1 : 0, pointerEvents: i === index ? "auto" : "none" }}
          aria-hidden={i !== index}
        >
          <ProductImage
            name={p.name}
            category={p.category}
            color={p.imageColor}
            imageUrl={p.imageUrl}
            size="lg"
          />
        </Link>
      ))}

      {products.length > 1 && (
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
          {products.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show ${p.name}`}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-6 bg-on-primary" : "w-1.5 bg-on-primary/50"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
