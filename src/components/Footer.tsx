import { Link } from "@tanstack/react-router";
import { useThemeStore } from "@/store/theme";
import { useTenant } from "@/store/tenant";
import { useProducts } from "@/data/products";

const FALLBACK_WHATSAPP = import.meta.env.VITE_WHATSAPP_NUMBER as string | undefined;

export function Footer() {
  const storeName = useThemeStore((s) => s.storeName);
  const logoUrl = useThemeStore((s) => s.logoUrl);
  const tenant = useTenant();
  const { data: products = [] } = useProducts();
  // Real categories in use by this tenant's own products (same source as
  // the homepage's "Shop by category" section) — never a fixed clothing
  // list, since not every tenant sells clothes.
  const categories = Array.from(new Set(products.map((p) => p.category))).slice(0, 4);

  // Per-tenant tagline from the tenant's own content (set via
  // supabase-content-migration.sql). Falls back to a generic line for
  // tenants that don't have hero_description set yet.
  const tagline =
    tenant?.content?.hero_description ?? "Shops, services & causes — powered by YouCommerce.";

  const whatsappNumber = tenant?.whatsapp_number || FALLBACK_WHATSAPP;
  const contactHref = whatsappNumber
    ? `https://wa.me/${whatsappNumber}`
    : "mailto:hello@youcommerce.co.za";

  return (
    <footer className="border-t border-border bg-surface mt-24">
      <div className="mx-auto max-w-7xl px-4 md:px-8 py-12 grid gap-10 md:grid-cols-3">
        <div>
          {logoUrl ? (
            <img src={logoUrl} alt={storeName} className="h-8 max-w-[160px] object-contain" />
          ) : (
            <div className="font-heading text-xl font-bold">
              {storeName}
              <span className="text-primary">.</span>
            </div>
          )}
          <p className="mt-3 text-sm text-muted max-w-xs">{tagline}</p>
        </div>

        <div>
          <h4 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted mb-3">Shop</h4>
          <ul className="space-y-2 text-sm">
            {categories.length > 0 ? (
              categories.map((c) => (
                <li key={c}>
                  <Link to="/shop" className="hover:text-primary transition-colors">
                    {c}
                  </Link>
                </li>
              ))
            ) : (
              <li>
                <Link to="/shop" className="hover:text-primary transition-colors">
                  All products
                </Link>
              </li>
            )}
          </ul>
        </div>

        <div>
          <h4 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted mb-3">
            About
          </h4>
          <ul className="space-y-2 text-sm">
            <li>
              <Link to="/" hash="about" className="hover:text-primary transition-colors">
                About {storeName}
              </Link>
            </li>
            <li>
              <a
                href={contactHref}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                Contact us
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 md:px-8 py-4 flex flex-wrap justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
          <span>
            © {new Date().getFullYear()} {storeName}
          </span>
          <span>Powered by YouCommerce</span>
        </div>
      </div>
    </footer>
  );
}
