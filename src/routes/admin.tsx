import {
  createFileRoute,
  Outlet,
  Link,
  useLocation,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useEffect } from "react";
import {
  LayoutGrid,
  Package,
  Receipt,
  Users,
  Palette,
  Settings,
  ArrowLeft,
  LogOut,
  Building2,
} from "lucide-react";

import { useThemeStore } from "@/store/theme";
import { useAuthLoading, useAuthStore, useIsAuthenticated, signOut } from "@/store/auth";
import { useIsPlatformAdmin } from "@/data/platform";
import { useTenant } from "@/store/tenant";

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
  const logoUrl = useThemeStore((s) => s.logoUrl);
  const user = useAuthStore((s) => s.user);
  const tenant = useTenant();
  const isAuthed = useIsAuthenticated();
  const authLoading = useAuthLoading();
  const navigate = useNavigate();
  const router = useRouter();
  const { pathname } = useLocation();
  // Only rendered for accounts on the platform_admins list — see
  // src/routes/platform.tsx. Most merchant admins never see this.
  const { data: isPlatformAdmin } = useIsPlatformAdmin();

  // Redirect to /login if the auth check is done and there's no user.
  // Preserve the attempted path as ?redirect= so we bounce back after login.
  useEffect(() => {
    if (!authLoading && !isAuthed) {
      navigate({
        to: "/login",
        search: { redirect: pathname },
        replace: true,
      });
    }
  }, [authLoading, isAuthed, navigate, pathname]);

  const handleSignOut = async () => {
    await signOut();
    router.invalidate(); // clear cached React Query data tied to the session
    navigate({ to: "/login", replace: true });
  };

  // Don't render the admin chrome until auth has resolved — avoids a
  // flash of "merchant console" before redirecting unauthenticated users.
  if (authLoading || !isAuthed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-muted text-sm">
        Checking session…
      </div>
    );
  }

  // Trial ended with no card ever added (see src/server/billing/cron.ts),
  // or unresolved past_due escalated further per billing-schema.sql's
  // state machine — lock the admin panel but deliberately keep the
  // storefront itself untouched (soft_suspended = "admin restricted,
  // storefront still up"). Settings stays reachable either way — it's the
  // only way out of this.
  const isSuspended =
    tenant?.billing_state === "soft_suspended" || tenant?.billing_state === "hard_suspended";
  const isSettingsRoute = pathname.startsWith("/admin/settings");
  if (isSuspended && !isSettingsRoute) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-4">
        <div className="max-w-sm text-center">
          <h1 className="font-heading text-xl font-semibold">Your free trial has ended</h1>
          <p className="mt-2 text-sm text-muted">
            Add a card to keep managing {storeName} — your storefront stays live for customers in
            the meantime.
          </p>
          <Link
            to="/admin/settings"
            className="mt-6 inline-block rounded-sm bg-primary text-onPrimary px-4 py-2 text-sm font-medium"
          >
            Set up billing
          </Link>
          <button
            onClick={handleSignOut}
            className="mt-4 block mx-auto font-mono text-[10px] uppercase tracking-[0.2em] text-muted hover:text-text"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-bg">
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-surface">
        <div className="px-5 py-5 border-b border-border">
          {logoUrl ? (
            <img src={logoUrl} alt={storeName} className="h-8 max-w-[160px] object-contain" />
          ) : (
            <div className="font-heading text-lg font-bold">
              {storeName}
              <span className="text-primary">.</span>
            </div>
          )}
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted mt-1">
            Merchant console
          </p>
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
                  active
                    ? "bg-bg text-text font-medium"
                    : "text-muted hover:text-text hover:bg-bg/50"
                }`}
              >
                <Icon size={15} /> {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-4 space-y-3">
          <Link
            to="/"
            className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted hover:text-text"
          >
            <ArrowLeft size={12} /> View storefront
          </Link>

          {isPlatformAdmin && (
            <Link
              to="/platform"
              className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted hover:text-text"
            >
              <Building2 size={12} /> Platform dashboard
            </Link>
          )}

          <div className="rounded-sm border border-border p-3 bg-bg">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              Signed in
            </div>
            <div className="text-xs mt-1 truncate" title={user?.email ?? ""}>
              {user?.email}
            </div>
            <button
              onClick={handleSignOut}
              className="mt-2 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted hover:text-text"
            >
              <LogOut size={11} /> Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="md:hidden border-b border-border p-4 flex items-center justify-between">
          <Link to="/" className="font-heading font-bold">
            {logoUrl ? (
              <img src={logoUrl} alt={storeName} className="h-7 max-w-[140px] object-contain" />
            ) : (
              <>
                {storeName}
                <span className="text-primary">.</span>
              </>
            )}
          </Link>
          <button
            onClick={handleSignOut}
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted"
          >
            Sign out
          </button>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
