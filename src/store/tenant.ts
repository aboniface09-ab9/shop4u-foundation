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

/**
 * Tenant store — holds the resolved tenant for the current request.
 * Loaded once on app boot by useTenantBootstrap() in __root.tsx.
 *
 * Until multi-tenant hostname routing lands, this resolves to a single
 * tenant via VITE_TENANT_SLUG. The store is intentionally simple — most
 * of the work happens in the bootstrap hook.
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
 * Fetch the current tenant by slug. Cached forever by React Query
 * (tenant rows change rarely; we'll invalidate explicitly when the
 * merchant edits their store name or theme).
 */
export function useTenantQuery() {
  return useQuery({
    queryKey: ["tenant", CURRENT_TENANT_SLUG],
    queryFn: async (): Promise<TenantRow> => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("slug", CURRENT_TENANT_SLUG)
        .single();
      if (error) throw error;
      return data as TenantRow;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Call this once at app boot (in __root.tsx). It:
 *   1. Loads the tenant by slug.
 *   2. Hydrates the theme store with the tenant's preset, store name, and logo mark.
 *   3. Mirrors the tenant into useTenantStore for components that need
 *      direct access to tenant.id or tenant.plan (e.g. admin chrome).
 *
 * The existing theme picker (DevPanel, /admin/theme) still works on top —
 * users can switch themes locally, the change persists via the existing
 * persist middleware. Tenant-row theme is the *initial* value, not a lock.
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

/** Convenience selector. */
export const useTenant = () => useTenantStore((s) => s.tenant);
export const useTenantId = () => useTenantStore((s) => s.tenant?.id ?? null);
