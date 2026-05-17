import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { LayoutGrid, Package, Receipt, Users, Palette, Settings, ArrowLeft } from "lucide-react";
import { useThemeStore } from "@/store/theme";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

const NAV: { to: string; label: string; icon: typeof LayoutGrid; exact?: boolean }[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutGrid, exact: true },
  { to: "/admin/products", label: "Products", icon: Package },
  { to: "/admin/orders", label: "Orders", icon: Receipt },
  { to: "/admin/customers", label: "Customers", icon: Users },
  { to: "/admin/theme", label: "Theme", icon: Palette },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

function AdminLayout() {
  const storeName = useThemeStore((s) => s.storeName);
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen flex bg-bg">
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-surface">
        <div className="px-5 py-5 border-b border-border">
          <div className="font-heading text-lg font-bold">{storeName}<span className="text-primary">.</span></div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted mt-1">Merchant console</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((n) => {
            const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors ${
                  active ? "bg-bg text-text font-medium" : "text-muted hover:text-text hover:bg-bg/50"
                }`}
              >
                <Icon size={15} /> {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-4">
          <Link to="/" className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted hover:text-text">
            <ArrowLeft size={12} /> View storefront
          </Link>
          <div className="mt-4 rounded-sm border border-border p-3 bg-bg">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Plan</div>
            <div className="text-sm font-semibold mt-1">Growth · R599/mo</div>
            <div className="text-[11px] text-muted mt-0.5">Renews 12 Jun</div>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="md:hidden border-b border-border p-4 flex items-center justify-between">
          <Link to="/" className="font-heading font-bold">{storeName}<span className="text-primary">.</span></Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Admin</span>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
