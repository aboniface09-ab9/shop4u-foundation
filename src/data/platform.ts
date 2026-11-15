import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase, type TenantRow } from "@/lib/supabase";
import { useAuthStore } from "@/store/auth";

/**
 * Platform-owner dashboard data — cross-tenant, NOT scoped to "the
 * current tenant" like everything under src/data/orders.ts etc. This is
 * for Adam's own /platform view, not a per-merchant admin page.
 *
 * Gating: whether the signed-in user is a platform admin is itself a
 * query (against `platform_admins`, see supabase-platform-admins-migration.sql)
 * rather than a hardcoded email check — the RLS policy on that table only
 * ever returns the caller's own row, so a non-admin querying it just gets
 * an empty result, not an error.
 */
export function useIsPlatformAdmin() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ["platform-admin", userId],
    enabled: !!userId,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("platform_admins")
        .select("auth_user_id")
        .eq("auth_user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });
}

/**
 * Every tenant on the platform, newest first. Works via the existing
 * `tenants_select_public` RLS policy (SELECT is public — the storefront
 * already relies on this to resolve-by-slug anonymously), so no
 * service-role key or special policy is needed here. The /platform route
 * is what actually gates who sees this page — the query itself isn't the
 * security boundary.
 */
export function usePlatformTenants() {
  return useQuery({
    queryKey: ["platform-tenants"],
    queryFn: async (): Promise<TenantRow[]> => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as TenantRow[];
    },
  });
}

// =========================================================================
// Subscription billing-run — merchants paying THEIR YouCommerce fee.
// See payfast-subscription-billing-brief.md. NOT tested end-to-end yet
// (blocked on Adam's own PayFast account existing).
//
// Both hooks below call service-role-gated Worker routes rather than
// querying `subscriptions` directly — that table holds `card_token`,
// which shouldn't be reachable via any client-side query path even under
// RLS. The routes themselves re-check the caller is a platform admin
// server-side (src/server/payfast/handlers.ts's requirePlatformAdmin) —
// this hook sending the bearer token isn't the security boundary, the
// server-side re-check is.
// =========================================================================

export type PlatformSubscriptionRow = {
  id: string;
  tenantId: string;
  plan: string;
  monthlyAmountCents: number;
  nextChargeDate: string;
  lastChargeStatus: string | null;
  lastChargeAt: string | null;
  hasCardToken: boolean;
  tenant: { slug: string; store_name: string | null; name: string; billing_state: string } | null;
};

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function usePlatformSubscriptionsDue() {
  return useQuery({
    queryKey: ["platform-subscriptions-due"],
    queryFn: async (): Promise<PlatformSubscriptionRow[]> => {
      const res = await fetch("/api/platform/subscriptions-due", { headers: await authHeader() });
      if (!res.ok) throw new Error(`Failed to load subscriptions: ${res.status} ${await res.text()}`);
      const { subscriptions } = (await res.json()) as { subscriptions: PlatformSubscriptionRow[] };
      return subscriptions;
    },
  });
}

export function useChargeSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (subscriptionId: string) => {
      const res = await fetch("/api/platform/charge-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ subscriptionId }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
      if (!res.ok || !body.ok) {
        throw new Error(body.reason ?? `Charge failed: ${res.status}`);
      }
      return body;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-subscriptions-due"] });
      qc.invalidateQueries({ queryKey: ["platform-tenants"] });
    },
  });
}
