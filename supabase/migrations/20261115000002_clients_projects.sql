-- Phase 2.1: custom-build clients, projects, content checklist, activity log.
-- Platform-admin-only: RLS on, no anon access, no merchant access.
-- Requires is_platform_admin() from 20261115000001_security_hardening.sql.
-- POPIA: minimal contact fields; no ID numbers; no registrar passwords
-- (credential_location records only WHERE a credential is kept).

CREATE TABLE public.clients (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name  text NOT NULL CHECK (char_length(company_name) BETWEEN 1 AND 200),
  trading_name  text CHECK (char_length(trading_name) <= 200),
  vat_number    text CHECK (char_length(vat_number) <= 30),
  billing_address text CHECK (char_length(billing_address) <= 500),
  status        text NOT NULL DEFAULT 'lead' CHECK (status IN ('lead', 'active', 'past')),
  notes         text CHECK (char_length(notes) <= 4000),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.client_contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  email       text CHECK (char_length(email) <= 254 AND email LIKE '%@%'),
  phone       text CHECK (char_length(phone) <= 40),
  role        text CHECK (char_length(role) <= 100),
  is_primary  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_contacts_client ON public.client_contacts (client_id);
-- At most one primary contact per client.
CREATE UNIQUE INDEX idx_client_contacts_one_primary ON public.client_contacts (client_id) WHERE is_primary;

CREATE TABLE public.projects (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name                 text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  stage                text NOT NULL DEFAULT 'discovery' CHECK (stage IN ('discovery', 'prototype', 'build', 'live')),
  repo_url             text CHECK (repo_url IS NULL OR repo_url ~ '^https://'),
  staging_url          text CHECK (staging_url IS NULL OR staging_url ~ '^https://'),
  production_url       text CHECK (production_url IS NULL OR production_url ~ '^https://'),
  domain_name          text CHECK (char_length(domain_name) <= 253),
  registrar            text CHECK (char_length(registrar) <= 100),
  domain_expiry        date,
  nameservers          text CHECK (char_length(nameservers) <= 500),
  dns_access_status    text NOT NULL DEFAULT 'unknown' CHECK (dns_access_status IN ('unknown', 'requested', 'granted', 'not_needed')),
  credential_location  text CHECK (char_length(credential_location) <= 200),
  hosting_provider     text NOT NULL DEFAULT 'Cloudflare' CHECK (char_length(hosting_provider) <= 100),
  hosting_plan         text CHECK (char_length(hosting_plan) <= 100),
  hosting_monthly_cents integer CHECK (hosting_monthly_cents IS NULL OR hosting_monthly_cents >= 0),
  hosting_start_date   date,
  launched_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_projects_client ON public.projects (client_id);

CREATE TABLE public.content_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  item        text NOT NULL CHECK (char_length(item) BETWEEN 1 AND 200),
  status      text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'received', 'approved', 'not_needed')),
  due_date    date,
  note        text CHECK (char_length(note) <= 1000),
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_content_items_project ON public.content_items (project_id, sort_order);

CREATE TABLE public.activity_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  text NOT NULL CHECK (char_length(entity_type) <= 50),
  entity_id    uuid NOT NULL,
  event        text NOT NULL CHECK (char_length(event) <= 100),
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor        uuid DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_log_entity ON public.activity_log (entity_type, entity_id, created_at DESC);

CREATE TRIGGER trg_clients_updated_at  BEFORE UPDATE ON public.clients  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Access: authenticated platform admins only. Nothing for anon.
ALTER TABLE public.clients         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.clients, public.client_contacts, public.projects,
              public.content_items, public.activity_log FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients, public.client_contacts,
      public.projects, public.content_items TO authenticated;
-- Audit trail is append-only for everyone except the service role.
GRANT SELECT, INSERT ON public.activity_log TO authenticated;

CREATE POLICY admin_all ON public.clients         FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY admin_all ON public.client_contacts FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY admin_all ON public.projects        FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY admin_all ON public.content_items   FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY admin_select ON public.activity_log FOR SELECT TO authenticated USING (is_platform_admin());
CREATE POLICY admin_insert ON public.activity_log FOR INSERT TO authenticated WITH CHECK (is_platform_admin() AND actor = auth.uid());
