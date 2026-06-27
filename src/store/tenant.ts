import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { create } from "zustand";

import {
  supabase,
  type TenantRow,
  type ThemePreset,
} from "@/lib/supabase";
import { useThemeStore } from "@/store/theme";
import { useAuthStore } from "@/store/auth";

/**
 * Tenant store — holds the resolved tenant for the current request.
 * Loaded once on app boot by useTenantBootstrap() in __root.tsx.
 *
 * Resolution strategy:
 *   1. If a user is signed in, look up their tenant via tenant_users
 *      (a user belongs to one or more tenants; pick the first for now).
 *   2. Otherwise (anonymous storefront visitor), use the slug resolved
 *      from the request's Host header by getTenantSlugFromHost() and
 *      passed down via the root route loader.
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
 * If a user is signed in their tenant is resolved via tenant_users instead.
 */
export function useTenantQuery(slug: string) {
  const userId = useAuthStore((s) => s.user?.id);

  return useQuery({
    queryKey: ["tenant", userId ?? `slug:${slug}`],
    queryFn: async (): Promise<TenantRow> => {
      // Authenticated branch: resolve via tenant_users link.
      if (userId) {
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

      // Anonymous branch: resolve by runtime slug (from Host header).
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("slug", slug)
        .single();
      if (error) throw error;
      return data as TenantRow;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Call this once at app boot (from __root.tsx). It:
 *   1. Loads the tenant (via user link if signed in, else by hostname slug).
 *   2. Hydrates the theme store with the tenant's preset, store name, and logo mark.
 *   3. Mirrors the tenant into useTenantStore for direct access.
 *
 * `slug` comes from the root route loader which resolves it server-side
 * from the request's Host header. Re-runs when the user signs in / out.
 */
export function useTenantBootstrap(slug: string) {
  const { data: tenant, isLoading, error } = useTenantQuery(slug);
  const setTenant = useTenantStore((s) => s.setTenant);
  const setStoreName = useThemeStore((s) => s.setStoreName);
  const setLogoMark = useThemeStore((s) => s.setLogoMark);
  const setTheme = useThemeStore((s) => s.setTheme);

  useEffect(() => {
    if (!tenant) return;
    setTenant(tenant);
    if (tenant.store_name) setStoreName(tenant.store_name);
    if (tenant.logo_mark) setLogoMark(tenant.logo_mark);
    const preset = tenant.theme?.preset as ThemePreset | undefined;
    if (preset === "heritage" || preset === "onyx" || preset === "volt") {
      setTheme(preset);
    }
  }, [tenant, setTenant, setStoreName, setLogoMark, setTheme]);

  return { tenant, isLoading, error };
}

/** Convenience selectors. */
export const useTenant = () => useTenantStore((s) => s.tenant);
export const useTenantId = () => useTenantStore((s) => s.tenant?.id ?? null);
