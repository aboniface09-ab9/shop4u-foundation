-- =============================================================================
-- Categories: per-tenant product categories
-- Run after the core schema migration.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.categories (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  name        text NOT NULL,
  sort_order  int  DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (tenant_id, name)
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Tenants can only see and manage their own categories
CREATE POLICY categories_tenant_isolation ON public.categories
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

-- Seed defaults for any tenants that already exist
INSERT INTO public.categories (tenant_id, name, sort_order)
SELECT t.id, v.name, v.ord
FROM public.tenants t
CROSS JOIN (
  VALUES ('Tops', 1), ('Bottoms', 2), ('Headwear', 3), ('Accessories', 4)
) AS v(name, ord)
ON CONFLICT (tenant_id, name) DO NOTHING;
