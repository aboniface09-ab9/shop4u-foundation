import { Link } from "@tanstack/react-router";
import { ShoppingBag, Search } from "lucide-react";
import { useCart } from "@/store/cart";
import { useThemeStore } from "@/store/theme";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/shop", label: "Shop" },
];

export function Header() {
  const open = useCart((s) => s.open);
  const count = useCart((s) => s.items.reduce((a, i) => a + i.qty, 0));
  const storeName = useThemeStore((s) => s.storeName);

  // The logo image lives in the hero (bigger, one clear brand moment on
  // landing) rather than duplicated here too — the sticky header just
  // uses the store name text, consistent on every page including ones
  // without a hero.
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 md:px-8">
        <Link to="/" className="font-heading text-xl font-bold tracking-tight">
          {storeName}
          <span className="text-primary">.</span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((n, i) => (
            <Link
              key={i}
              to={n.to}
              className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted hover:text-text transition-colors"
              activeProps={{ className: "text-text" }}
              activeOptions={{ exact: n.to === "/" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button aria-label="Search" className="p-2 text-muted hover:text-text rounded-sm">
            <Search size={18} />
          </button>
          <button
            onClick={open}
            aria-label={`Cart, ${count} ${count === 1 ? "item" : "items"}`}
            className="relative p-2 text-text rounded-sm hover:bg-surface"
          >
            <ShoppingBag size={18} />
            {count > 0 && (
              <span
                className="absolute -right-0.5 -top-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-on-primary text-[10px] font-mono font-bold flex items-center justify-center"
                aria-hidden
              >
                {count}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
