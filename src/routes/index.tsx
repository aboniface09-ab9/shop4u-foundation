import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useProducts } from "@/data/products";
import { ProductCard } from "@/components/ProductCard";
import { ProductImage } from "@/components/ProductImage";
import { HeroCarousel } from "@/components/HeroCarousel";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/store/tenant";
import { useThemeStore } from "@/store/theme";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const { data: products = [] } = useProducts();
  const featured = products.slice(0, 4);
  // Real categories in use by this tenant's own products — not a fixed
  // clothing-store list. Only categories with at least one product show,
  // so there's nothing dead to "get rid of": add/rename categories via
  // Admin → Settings → Product categories, and they appear here once a
  // product actually uses one.
  const categories = Array.from(new Set(products.map((p) => p.category))).slice(0, 4);

  const tenant = useTenant();
  const c = tenant?.content ?? {};
  const logoUrl = useThemeStore((s) => s.logoUrl);
  const storeName = useThemeStore((s) => s.storeName);

  // Merchant-selected hero rotation (Admin → Settings → Homepage hero).
  // Falls back to just the first product (the old static behaviour) if
  // nothing's been picked, or if a picked slug no longer matches a live
  // product (deleted/archived since selection).
  const heroSlugs = c.hero_product_slugs ?? [];
  const heroProducts = heroSlugs.length
    ? heroSlugs
        .map((slug) => products.find((p) => p.id === slug))
        .filter((p): p is (typeof products)[number] => !!p)
    : products.slice(0, 1);

  const eyebrow = c.hero_eyebrow ?? "";
  const headline = c.hero_headline ?? tenant?.store_name ?? "Welcome";
  const description = c.hero_description ?? "";
  const ctaPrimary = c.hero_cta_primary ?? "Shop now";
  const ctaSecondary = c.hero_cta_secondary ?? "Learn more";
  // Always show an About section — falls back to the hero description
  // (or a generic line) so a new tenant that hasn't set studio_* copy yet
  // still gets a real "what is this business" answer on the homepage,
  // rather than the section silently disappearing.
  const studioHeadline = c.studio_headline || `About ${tenant?.store_name ?? "us"}`;
  const studioBody =
    c.studio_body ||
    description ||
    "We're an independent, local business. This is our online shop — get in touch any time if you have questions before you order.";

  return (
    <div>
      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 md:px-8 pt-8 md:pt-12">
        <div className="grid gap-10 md:grid-cols-12 md:items-center">
          <div className="md:col-span-6">
            {logoUrl && (
              <img
                src={logoUrl}
                alt={storeName}
                className="h-24 md:h-32 max-w-[360px] object-contain mb-7"
              />
            )}
            {eyebrow && (
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted mb-5">
                {eyebrow}
              </p>
            )}
            <h1 className="font-heading text-4xl md:text-6xl font-semibold leading-[0.95] tracking-tight">
              {headline.split("\n").map((line, i) => (
                <span key={i}>
                  {i === 1 ? <span className="text-primary">{line}</span> : line}
                  {i < headline.split("\n").length - 1 && <br />}
                </span>
              ))}
            </h1>
            {description && <p className="mt-6 max-w-md text-base text-muted">{description}</p>}
            <div className="mt-8 flex gap-3">
              <Button asChild size="lg">
                <Link to="/shop">
                  {ctaPrimary} <ArrowRight className="ml-2" size={16} />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/shop">{ctaSecondary}</Link>
              </Button>
            </div>
          </div>
          <div className="md:col-span-6">
            <HeroCarousel products={heroProducts} />
          </div>
        </div>
      </section>

      {/* Categories — only shows once the tenant has products in at least one category */}
      {categories.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 md:px-8 mt-20">
          <div className="flex items-end justify-between mb-6">
            <h2 className="font-heading text-2xl md:text-3xl font-semibold">Shop by category</h2>
            <Link
              to="/shop"
              className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted hover:text-text"
            >
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {categories.map((c) => {
              const seed = products.find((p) => p.category === c);
              return (
                <Link
                  key={c}
                  to="/shop"
                  className="block aspect-square overflow-hidden rounded-md group"
                >
                  <div className="h-full w-full transition-transform duration-500 group-hover:scale-105">
                    <ProductImage
                      name={c}
                      category="Category"
                      color={seed?.imageColor ?? "#3D7A8A"}
                      imageUrl={seed?.imageUrl}
                      size="md"
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Featured */}
      {featured.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 md:px-8 mt-20">
          <div className="flex items-end justify-between mb-6">
            <h2 className="font-heading text-2xl md:text-3xl font-semibold">Featured</h2>
            <Link
              to="/shop"
              className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted hover:text-text"
            >
              All products →
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8">
            {featured.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {/* About — always visible, id="about" so the footer's "About" link
          and any other anchor can jump straight here. scroll-mt accounts
          for the sticky header so the heading doesn't land underneath it. */}
      <section id="about" className="mx-auto max-w-7xl px-4 md:px-8 mt-24 scroll-mt-24">
        <div className="border-t border-border pt-12 grid md:grid-cols-12 gap-6">
          <p className="md:col-span-12 font-mono text-[11px] uppercase tracking-[0.24em] text-muted mb-1">
            About
          </p>
          <h3 className="md:col-span-4 font-heading text-2xl md:text-3xl font-semibold">
            {studioHeadline}
          </h3>
          <p className="md:col-span-6 md:col-start-6 text-muted">{studioBody}</p>
        </div>
      </section>
    </div>
  );
}
