import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { create } from "zustand";

import {
  CURRENT_TENANT_SLUG,
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
 *   2. Otherwise (anonymous storefront browser), fall back to the
 *      VITE_TENANT_SLUG env var. Replaced by hostname routing later.
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
 * If `userId` is provided, joins through tenant_users to find which
 * tenant they belong to. Otherwise looks up by slug.
 */
export function useTenantQuery() {
  const userId = useAuthStore((s) => s.user?.id);

  return useQuery({
    queryKey: ["tenant", userId ?? `slug:${CURRENT_TENANT_SLUG}`],
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

      // Anonymous branch: resolve by slug (storefront).
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("slug", CURRENT_TENANT_SLUG)
        .single();
      if (error) throw error;
      return data as TenantRow;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Call this once at app boot (from __root.tsx). It:
 *   1. Loads the tenant (via user link if signed in, else by slug).
 *   2. Hydrates the theme store with the tenant's preset, store name, and logo mark.
 *   3. Mirrors the tenant into useTenantStore for direct access.
 *
 * Re-runs when the user signs in / out so the admin view picks up the
 * right tenant immediately.
 */
export function useTenantBootstrap() {
  const { data: tenant, isLoading, error } = useTenantQuery();
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
