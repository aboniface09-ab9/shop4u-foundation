import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useLocation,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CartDrawer } from "@/components/CartDrawer";
import { DevPanel } from "@/components/DevPanel";
import { applyTheme, useThemeStore } from "@/store/theme";
import { useTenantBootstrap } from "@/store/tenant";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="max-w-md text-center">
        <h1 className="font-heading text-7xl font-bold">404</h1>
        <p className="mt-4 text-muted">This page slipped through the racks.</p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary"
        >
          Back to the shop
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="max-w-md text-center">
        <h1 className="font-heading text-xl font-semibold">Something broke</h1>
        <p className="mt-2 text-sm text-muted">{error.message}</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Foundry — Small-batch streetwear, Cape Town" },
      { name: "description", content: "Heavyweight basics and outerwear, cut and sewn in Salt River. Powered by Shop4U." },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}

/**
 * Inner shell — split out so it can use React Query hooks
 * (useTenantBootstrap), which require the QueryClientProvider to already
 * be in the tree above them.
 */
function AppShell() {
  const { theme, layout } = useThemeStore();
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith("/admin");

  // Bootstrap the current tenant by VITE_TENANT_SLUG on app load.
  // Hydrates store name, logo mark, and initial theme preset from the row.
  useTenantBootstrap();

  // Re-apply theme tokens whenever the preset changes (theme can be
  // changed locally via DevPanel / theme editor even after bootstrap).
  useEffect(() => { applyTheme(theme, layout); }, [theme, layout]);

  return (
    <>
      <div className="min-h-screen flex flex-col bg-bg text-text">
        {!isAdmin && <Header />}
        <main className="flex-1">
          <Outlet />
        </main>
        {!isAdmin && <Footer />}
      </div>
      <CartDrawer />
      <DevPanel />
      <Toaster />
    </>
  );
}
