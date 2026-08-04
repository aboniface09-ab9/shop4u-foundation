import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { create } from "zustand";

import { supabase, type TenantRow, type ThemePreset } from "@/lib/supabase";
import { useThemeStore } from "@/store/theme";
import { useAuthStore } from "@/store/auth";

/**
 * Tenant store — holds the resolved tenant for the current request.
 * Loaded once on app boot by useTenantBootstrap() in __root.tsx.
 *
 * Resolution strategy:
 *   1. On /admin routes, if a user is signed in, look up their tenant via
 *      tenant_users (a user belongs to one or more tenants; pick the first
 *      for now) — this is the "log in as this merchant" console.
 *   2. Everywhere else (the public storefront), always resolve by the slug
 *      resolved from the request's Host header by getTenantSlugFromHost()
 *      and passed down via the root route loader — regardless of whether
 *      some other merchant happens to be signed in on this browser.
 *
 * Bug fixed 2026-07-18: this used to key off "is anyone signed in at all",
 * which meant a signed-in merchant admin's tenant leaked into the public
 * storefront (e.g. logging into Dayle's admin, then visiting a *different*
 * tenant's plain storefront URL, would still show Dayle's store). Storefront
 * resolution must never depend on auth state — only /admin should.
 */
type TenantState = {
  tenant: TenantRow | null;
  setTenant: (t: TenantRow | null) => void;
};

export const useTenantStore = create<TenantState>((set) => ({
  tenant: null,
  setTenant: (tenant) => set({ tenant }),
}));

/**
 * Fetch the tenant for the current viewer.
 *
 * `slug` is the runtime-resolved tenant slug from the root route loader
 * (extracted from the request's Host header by getTenantSlugFromHost).
 * `isAdmin` marks whether we're inside the /admin console — only there
 * does a signed-in user's tenant_users link override the hostname slug.
 */
export function useTenantQuery(slug: string, isAdmin: boolean) {
  const userId = useAuthStore((s) => s.user?.id);
  const resolveViaAuth = isAdmin && !!userId;

  return useQuery({
    queryKey: ["tenant", resolveViaAuth ? `user:${userId}` : `slug:${slug}`],
    queryFn: async (): Promise<TenantRow> => {
      // Admin branch: resolve via the signed-in user's tenant_users link.
      if (resolveViaAuth) {
        const { data, error } = await supabase
          .from("tenant_users")
          .select("tenant:tenants(*)")
          .eq("auth_user_id", userId)
          .limit(1)
          .single();
        if (error) throw error;
        const tenant = (data as { tenant: TenantRow | null })?.tenant;
        if (!tenant) {
          throw new Error("User is not linked to any tenant. Contact platform admin.");
        }
        return tenant;
      }

      // Storefront branch (always, regardless of auth state): resolve by
      // the runtime slug from the Host header.
      const { data, error } = await supabase.from("tenants").select("*").eq("slug", slug).single();
      if (error) throw error;
      return data as TenantRow;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Call this once at app boot (from __root.tsx). It:
 *   1. Loads the tenant — via the signed-in user's tenant_users link when
 *      `isAdmin` is true, otherwise always by hostname slug.
 *   2. Hydrates the theme store with the tenant's preset, store name, and logo mark.
 *   3. Mirrors the tenant into useTenantStore for direct access.
 *
 * `slug` comes from the root route loader which resolves it server-side
 * from the request's Host header. `isAdmin` is whether the current route
 * is under /admin. Re-runs when the user signs in / out or navigates
 * between the storefront and /admin.
 */
export function useTenantBootstrap(slug: string, isAdmin: boolean) {
  const { data: tenant, isLoading, error } = useTenantQuery(slug, isAdmin);
  const setTenant = useTenantStore((s) => s.setTenant);
  const setStoreName = useThemeStore((s) => s.setStoreName);
  const setLogoMark = useThemeStore((s) => s.setLogoMark);
  const setLogoUrl = useThemeStore((s) => s.setLogoUrl);
  const setTheme = useThemeStore((s) => s.setTheme);
  const setColors = useThemeStore((s) => s.setColors);

  useEffect(() => {
    if (!tenant) return;
    setTenant(tenant);
    if (tenant.store_name) setStoreName(tenant.store_name);
    if (tenant.logo_mark) setLogoMark(tenant.logo_mark);
    setLogoUrl(tenant.logo_url ?? null);
    const preset = tenant.theme?.preset as ThemePreset | undefined;
    if (preset === "heritage" || preset === "onyx" || preset === "volt") {
      setTheme(preset);
    }
    // Custom per-tenant color overrides (mid-tier+ feature) — defaults to
    // {} for tenants that haven't set any, which clears any stale colors
    // from a previously-viewed tenant.
    setColors(tenant.theme?.colors ?? {});
  }, [tenant, setTenant, setStoreName, setLogoMark, setLogoUrl, setTheme, setColors]);

  return { tenant, isLoading, error };
}

/** Convenience selectors. */
export const useTenant = () => useTenantStore((s) => s.tenant);
export const useTenantId = () => useTenantStore((s) => s.tenant?.id ?? null);
