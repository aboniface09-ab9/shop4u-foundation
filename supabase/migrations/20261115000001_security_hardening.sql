-- Phase 0.4 security hardening. NOT YET APPLIED ANYWHERE.
-- Apply to the DEV database first, run supabase/tests/security_hardening.sql,
-- click through /admin as a fictional merchant, and only then (with Adam's
-- approval) apply to production. Repo policies may differ from the live ones
-- (anonymous checkout works in production but the repo's orders policy is
-- authenticated-only), so compare against the live database before applying.
--
-- Findings fixed here:
--  H1  a merchant could UPDATE any column of their own tenants row from the
--      browser (plan, billing_state, trial_ends_at, payfast_enabled, slug...).
--  H1b tenant_users policy was FOR ALL with CHECK (auth_user_id = auth.uid()),
--      so any signed-in user could INSERT a row linking themselves to ANY
--      tenant. Merchants only ever need to READ their own link.
--  H2  a merchant could read/write their own subscriptions row (card_token,
--      monthly_amount_cents). The browser never queries subscriptions or
--      charges (verified by grep); only service-role Worker routes do.
--  M3  mutable search_path on SECURITY DEFINER helper.
--  M5  platform-admin helper for later RLS (no more per-tenant "staff" links).

BEGIN;

-- ── H1: tenants — merchants may update only branding/content columns ────────
REVOKE UPDATE ON public.tenants FROM authenticated, anon;
GRANT UPDATE (store_name, logo_mark, logo_url, theme, content, vat_registered)
  ON public.tenants TO authenticated;
-- RLS policy tenants_update_own (user_owns_tenant) still limits WHICH row.

-- ── H1b: tenant_users — read own links only; writes via service role ────────
DROP POLICY IF EXISTS tenant_users_isolation ON public.tenant_users;
CREATE POLICY tenant_users_select_own ON public.tenant_users
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.tenant_users FROM authenticated, anon;

-- ── H2: subscriptions and charges — service role only ───────────────────────
DROP POLICY IF EXISTS subscriptions_isolation ON public.subscriptions;
DROP POLICY IF EXISTS tenant_isolation_subs ON public.subscriptions;
DROP POLICY IF EXISTS charges_select ON public.charges;
DROP POLICY IF EXISTS tenant_isolation_charges ON public.charges;
REVOKE ALL ON public.subscriptions FROM authenticated, anon;
REVOKE ALL ON public.charges FROM authenticated, anon;

-- ── M3: pin search_path on the SECURITY DEFINER helper ──────────────────────
-- Execute is NOT revoked from anon: products_select_public calls it.
ALTER FUNCTION public.user_owns_tenant(uuid) SET search_path = public, pg_temp;

-- ── M5: platform admin helper ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE auth_user_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

COMMIT;

-- Not covered (needs the live definition): get_order_by_reference is SECURITY
-- DEFINER and callable by anon; its source is not in this repo.
