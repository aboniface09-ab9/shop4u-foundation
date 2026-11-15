import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { LogOut } from "lucide-react";

import { useAuthLoading, useAuthStore, useIsAuthenticated, signOut } from "@/store/auth";
import { useIsPlatformAdmin } from "@/data/platform";

/**
 * /platform — the YouCommerce owner's dashboard, across every tenant and
 * client. Separate from /admin, which is scoped to one merchant.
 *
 * This layout is the UI gate (sign-in + platform_admins check). It is NOT the
 * security boundary: every table behind these pages must enforce
 * platform-admin-only access itself (RLS via is_platform_admin(), or a Worker
 * route that re-checks server-side). Never rely on this page check alone.
 */
export const Route = createFileRoute("/platform")({
  component: PlatformLayout,
});

// Add an entry here as each section is built (clients, quotes, invoices…).
const NAV: { to: string; label: string }[] = [
  { to: "/platform/clients", label: "Clients" },
  { to: "/platform/quotes", label: "Quotes" },
  { to: "/platform/price-list", label: "Price list" },
  { to: "/platform/merchants", label: "Merchants" },
  { to: "/platform/settings", label: "Settings" },
];

function PlatformLayout() {
  const isAuthed = useIsAuthenticated();
  const authLoading = useAuthLoading();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !isAuthed) {
      navigate({ to: "/login", search: { redirect: "/platform" }, replace: true });
    }
  }, [authLoading, isAuthed, navigate]);

  const { data: isPlatformAdmin, isLoading: checkingAdmin } = useIsPlatformAdmin();

  if (authLoading || !isAuthed || checkingAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-muted text-sm">
        Checking access…
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-4">
        <div className="max-w-sm text-center">
          <h1 className="font-heading text-xl font-semibold">Not authorized</h1>
          <p className="mt-2 text-sm text-muted">
            This account ({user?.email}) isn&apos;t on the platform admin list.
          </p>
          <Link to="/admin" className="mt-6 inline-block text-sm underline">
            Back to your store admin
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-10">
          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            <img src="/logo-mark.png" alt="" className="h-4 w-4 rounded-sm" />
            YouCommerce · Platform
          </p>
          <button
            onClick={() => signOut().then(() => navigate({ to: "/login" }))}
            className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted hover:text-text"
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>
        <nav
          aria-label="Platform sections"
          className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 md:px-10"
        >
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-text"
              activeProps={{ className: "border-text text-text" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-4 md:p-10">
        <Outlet />
      </main>
    </div>
  );
}
