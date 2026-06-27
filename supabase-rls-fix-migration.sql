-- =============================================================================
-- RLS policy fix: replace current_tenant_id() session-variable approach
-- with auth.uid() + tenant_users join, which works with the Supabase JS client.
--
-- current_tenant_id() only works when the app explicitly runs
-- SET LOCAL app.current_tenant_id = '...' before each query — which the
-- Supabase JS client never does. auth.uid() is injected automatically
-- from the JWT on every authenticated request.
-- =============================================================================

-- Helper: checks whether the calling user belongs to a given tenant.
CREATE OR REPLACE FUNCTION user_owns_tenant(tid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_users
    WHERE tenant_id = tid AND auth_user_id = auth.uid()
  );
$$;

-- ── tenants ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tenants_update_own ON public.tenants;

CREATE POLICY tenants_update_own ON public.tenants
  FOR UPDATE
  TO authenticated
  USING (user_owns_tenant(id))
  WITH CHECK (user_owns_tenant(id));

-- ── tenant_users ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tenant_users_isolation ON public.tenant_users;

CREATE POLICY tenant_users_isolation ON public.tenant_users
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE auth_user_id = auth.uid()
    )
  );

-- ── products ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS products_select_public ON public.products;
DROP POLICY IF EXISTS products_write_own ON public.products;

-- Storefront can read active products for any tenant (public, no auth required)
CREATE POLICY products_select_public ON public.products
  FOR SELECT
  USING (
    status = 'active'
    OR user_owns_tenant(tenant_id)
  );

-- Merchants can insert/update/delete only their own tenant's products
CREATE POLICY products_write_own ON public.products
  FOR ALL
  TO authenticated
  USING (user_owns_tenant(tenant_id))
  WITH CHECK (user_owns_tenant(tenant_id));

-- ── orders ───────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS orders_isolation ON public.orders;

CREATE POLICY orders_isolation ON public.orders
  FOR ALL
  TO authenticated
  USING (user_owns_tenant(tenant_id))
  WITH CHECK (user_owns_tenant(tenant_id));

-- ── subscriptions ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS subscriptions_isolation ON public.subscriptions;

CREATE POLICY subscriptions_isolation ON public.subscriptions
  FOR ALL
  TO authenticated
  USING (user_owns_tenant(tenant_id))
  WITH CHECK (user_owns_tenant(tenant_id));

-- ── charges ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS charges_select ON public.charges;

CREATE POLICY charges_select ON public.charges
  FOR SELECT
  TO authenticated
  USING (user_owns_tenant(tenant_id));

-- ── categories (created in a prior migration) ─────────────────────────────

DROP POLICY IF EXISTS categories_tenant_isolation ON public.categories;

CREATE POLICY categories_tenant_isolation ON public.categories
  FOR ALL
  TO authenticated
  USING (user_owns_tenant(tenant_id))
  WITH CHECK (user_owns_tenant(tenant_id));
