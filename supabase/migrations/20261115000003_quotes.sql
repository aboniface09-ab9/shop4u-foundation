-- Phase 3.1: price list, quotes (draft stage), business settings, numbering.
-- Platform-admin-only (RLS + no anon grants). Money is integer cents, ex VAT.
-- Quote lines are COPIES of price-list rows, so later price changes never alter a quote.
-- Send/view/accept columns arrive in the Phase 4 migration.

CREATE TABLE public.business_settings (
  id                      smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  legal_name              text NOT NULL DEFAULT '' CHECK (char_length(legal_name) <= 200),
  registration_number     text NOT NULL DEFAULT '' CHECK (char_length(registration_number) <= 50),
  vat_registered          boolean NOT NULL DEFAULT false,
  vat_number              text NOT NULL DEFAULT '' CHECK (char_length(vat_number) <= 30),
  address                 text NOT NULL DEFAULT '' CHECK (char_length(address) <= 500),
  email                   text NOT NULL DEFAULT '' CHECK (char_length(email) <= 254),
  phone                   text NOT NULL DEFAULT '' CHECK (char_length(phone) <= 40),
  -- Company's own EFT details, shown on invoices (Phase 5). Business data, not customer data.
  bank_name               text NOT NULL DEFAULT '' CHECK (char_length(bank_name) <= 100),
  account_holder          text NOT NULL DEFAULT '' CHECK (char_length(account_holder) <= 200),
  account_number          text NOT NULL DEFAULT '' CHECK (char_length(account_number) <= 30),
  branch_code             text NOT NULL DEFAULT '' CHECK (char_length(branch_code) <= 20),
  default_validity_days   integer NOT NULL DEFAULT 30 CHECK (default_validity_days BETWEEN 1 AND 365),
  default_deposit_percent integer NOT NULL DEFAULT 50 CHECK (default_deposit_percent BETWEEN 0 AND 100),
  default_terms           text NOT NULL DEFAULT '' CHECK (char_length(default_terms) <= 8000),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.business_settings (id, legal_name, email, default_terms) VALUES (
  1, 'YouCommerce (Pty) Ltd', 'hello@youcommerce.co.za',
  E'All prices are in South African Rand.\nA deposit is payable on acceptance and the balance of the build on launch. Monthly hosting and maintenance starts on launch day and is month-to-month.\nDomain names, photography, copywriting, extra pages and third-party fees are not included unless listed.\n(Draft wording: have an attorney review before first use.)'
);

CREATE TABLE public.price_list_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL UNIQUE CHECK (char_length(code) BETWEEN 1 AND 40),
  name             text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description      text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  kind             text NOT NULL CHECK (kind IN ('once_off', 'monthly')),
  active           boolean NOT NULL DEFAULT true,
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.document_counters (
  kind      text NOT NULL,
  year      integer NOT NULL,
  last_no   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, year)
);

-- Atomic, gap-tolerant numbering: Q-2026-0001, INV-2026-0001.
CREATE OR REPLACE FUNCTION public.next_document_number(p_kind text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  yr int := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Africa/Johannesburg'))::int;
  n  int;
  prefix text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF p_kind = 'quote' THEN prefix := 'Q';
  ELSIF p_kind = 'invoice' THEN prefix := 'INV';
  ELSE RAISE EXCEPTION 'unknown document kind %', p_kind;
  END IF;
  INSERT INTO public.document_counters (kind, year, last_no) VALUES (p_kind, yr, 1)
  ON CONFLICT (kind, year) DO UPDATE SET last_no = public.document_counters.last_no + 1
  RETURNING last_no INTO n;
  RETURN prefix || '-' || yr || '-' || lpad(n::text, 4, '0');
END $$;
REVOKE ALL ON FUNCTION public.next_document_number(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_document_number(text) TO authenticated;

CREATE TABLE public.quotes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number           text NOT NULL UNIQUE,
  client_id        uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  project_id       uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired')),
  valid_until      date NOT NULL,
  deposit_percent  integer NOT NULL DEFAULT 50 CHECK (deposit_percent BETWEEN 0 AND 100),
  vat_rate_bps     integer NOT NULL DEFAULT 0 CHECK (vat_rate_bps BETWEEN 0 AND 3000),  -- 0 = no VAT; 1500 = 15%
  intro            text NOT NULL DEFAULT '' CHECK (char_length(intro) <= 4000),
  terms            text NOT NULL DEFAULT '' CHECK (char_length(terms) <= 8000),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_quotes_client ON public.quotes (client_id);

CREATE TABLE public.quote_lines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id         uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('once_off', 'monthly')),
  name             text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description      text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  quantity         integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 1000),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  sort_order       integer NOT NULL DEFAULT 0,
  price_item_id    uuid REFERENCES public.price_list_items(id) ON DELETE SET NULL
);
CREATE INDEX idx_quote_lines_quote ON public.quote_lines (quote_id, sort_order);

CREATE TRIGGER trg_quotes_updated_at BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_business_settings_updated_at BEFORE UPDATE ON public.business_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_list_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_lines       ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.business_settings, public.price_list_items, public.document_counters,
              public.quotes, public.quote_lines FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.business_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_list_items, public.quotes, public.quote_lines TO authenticated;
-- document_counters: only the SECURITY DEFINER function touches it.

CREATE POLICY admin_select ON public.business_settings FOR SELECT TO authenticated USING (is_platform_admin());
CREATE POLICY admin_update ON public.business_settings FOR UPDATE TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY admin_all    ON public.price_list_items  FOR ALL    TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY admin_select ON public.quotes FOR SELECT TO authenticated USING (is_platform_admin());
CREATE POLICY admin_insert ON public.quotes FOR INSERT TO authenticated WITH CHECK (is_platform_admin() AND status = 'draft');
-- Only drafts are editable or deletable from the browser; sent quotes are locked.
CREATE POLICY admin_update_draft ON public.quotes FOR UPDATE TO authenticated USING (is_platform_admin() AND status = 'draft') WITH CHECK (is_platform_admin() AND status = 'draft');
CREATE POLICY admin_delete_draft ON public.quotes FOR DELETE TO authenticated USING (is_platform_admin() AND status = 'draft');

CREATE POLICY admin_select ON public.quote_lines FOR SELECT TO authenticated USING (is_platform_admin());
CREATE POLICY admin_write_draft ON public.quote_lines FOR ALL TO authenticated
  USING (is_platform_admin() AND EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND q.status = 'draft'))
  WITH CHECK (is_platform_admin() AND EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND q.status = 'draft'));
