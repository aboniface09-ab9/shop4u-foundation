import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { products, ProductCategory } from "@/data/products";
import { ProductCard } from "@/components/ProductCard";

export const Route = createFileRoute("/shop")({
  component: Shop,
});

const CATEGORIES: (ProductCategory | "All")[] = ["All", "Tops", "Bottoms", "Headwear", "Accessories"];
const SORTS = [
  { id: "featured", label: "Featured" },
  { id: "low", label: "Price ↑" },
  { id: "high", label: "Price ↓" },
] as const;

function Shop() {
  const [cat, setCat] = useState<(ProductCategory | "All")>("All");
  const [sort, setSort] = useState<typeof SORTS[number]["id"]>("featured");

  const list = useMemo(() => {
    let l = products.filter((p) => cat === "All" || p.category === cat);
    if (sort === "low") l = [...l].sort((a, b) => a.price - b.price);
    if (sort === "high") l = [...l].sort((a, b) => b.price - a.price);
    return l;
  }, [cat, sort]);

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-8 py-10 md:py-16">
      <header className="mb-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">The drop</p>
        <h1 className="font-heading text-4xl md:text-5xl font-semibold mt-2">All products</h1>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-8 pb-4 border-b border-border">
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] rounded-sm border transition-colors ${
                cat === c
                  ? "bg-text text-bg border-text"
                  : "border-border text-muted hover:text-text"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="bg-bg border border-border rounded-sm px-2 py-1 text-sm font-mono"
          >
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-10">
        {list.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>

      {list.length === 0 && (
        <p className="text-center text-muted py-20">No products in this category yet.</p>
      )}
    </div>
  );
}
