import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { products } from "@/data/products";
import { ProductCard } from "@/components/ProductCard";
import { ProductImage } from "@/components/ProductImage";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Home,
});

const CATEGORIES = ["Tops", "Bottoms", "Headwear", "Accessories"] as const;

function Home() {
  const featured = products.slice(0, 4);
  const hero = products[4]; // Stadium Jacket — the big drop

  return (
    <div>
      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 md:px-8 pt-10 md:pt-16">
        <div className="grid gap-10 md:grid-cols-12 md:items-end">
          <div className="md:col-span-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted mb-5">
              Drop 03 · Autumn ’26
            </p>
            <h1 className="font-heading text-5xl md:text-7xl font-semibold leading-[0.95] tracking-tight">
              Cut & sewn,<br />
              <span className="text-primary">one block</span> at a time.
            </h1>
            <p className="mt-6 max-w-md text-base text-muted">
              Foundry is a small-batch streetwear studio in Salt River, Cape Town.
              Eight pieces per season. Built to outlast the trend cycle.
            </p>
            <div className="mt-8 flex gap-3">
              <Button asChild size="lg">
                <Link to="/shop">
                  Shop the drop <ArrowRight className="ml-2" size={16} />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/shop">The studio</Link>
              </Button>
            </div>
          </div>
          <div className="md:col-span-6">
            <Link
              to="/product/$id"
              params={{ id: hero.id }}
              className="block aspect-[4/5] overflow-hidden rounded-lg"
            >
              <ProductImage
                name={hero.name}
                category={hero.category}
                color={hero.imageColor}
                size="lg"
              />
            </Link>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-7xl px-4 md:px-8 mt-20">
        <div className="flex items-end justify-between mb-6">
          <h2 className="font-heading text-2xl md:text-3xl font-semibold">Shop by category</h2>
          <Link to="/shop" className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted hover:text-text">
            View all →
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CATEGORIES.map((c) => {
            const seed = products.find((p) => p.category === c)!;
            return (
              <Link key={c} to="/shop" className="block aspect-square overflow-hidden rounded-md group">
                <div className="h-full w-full transition-transform duration-500 group-hover:scale-105">
                  <ProductImage name={c} category="Category" color={seed.imageColor} size="md" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Featured */}
      <section className="mx-auto max-w-7xl px-4 md:px-8 mt-20">
        <div className="flex items-end justify-between mb-6">
          <h2 className="font-heading text-2xl md:text-3xl font-semibold">Featured</h2>
          <Link to="/shop" className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted hover:text-text">
            All products →
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8">
          {featured.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* Studio note */}
      <section className="mx-auto max-w-7xl px-4 md:px-8 mt-24">
        <div className="border-t border-border pt-12 grid md:grid-cols-12 gap-6">
          <h3 className="md:col-span-4 font-heading text-2xl font-semibold">
            Made by hand, in Cape Town.
          </h3>
          <p className="md:col-span-6 md:col-start-6 text-muted">
            Every piece is patterned, cut, and stitched within five kilometres of our studio.
            We work with three machinists, one fabric mill, and zero seasonal hype. When a run
            sells out it’s gone — the next one will be a little different.
          </p>
        </div>
      </section>
    </div>
  );
}
