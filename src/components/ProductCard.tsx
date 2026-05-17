import { Link } from "@tanstack/react-router";
import { Product } from "@/data/products";
import { ProductImage } from "./ProductImage";
import { formatZAR } from "@/lib/format";

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      to="/product/$id"
      params={{ id: product.id }}
      className="group block focus:outline-none"
    >
      <div className="aspect-[4/5] mb-3 overflow-hidden rounded-md">
        <div className="h-full w-full transition-transform duration-500 group-hover:scale-[1.03]">
          <ProductImage
            name={product.name}
            category={product.category}
            color={product.imageColor}
            size="md"
          />
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-heading text-base font-semibold text-text">{product.name}</h3>
        <span className="font-mono text-sm text-text">{formatZAR(product.price)}</span>
      </div>
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted mt-0.5">
        {product.category}
      </p>
    </Link>
  );
}
