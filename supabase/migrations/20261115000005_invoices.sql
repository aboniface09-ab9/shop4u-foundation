-- Phase 5: invoices (deposit, balance, monthly hosting), recurring plans, private invoice links.
--
-- Flow:
--   accept_quote()            -> DRAFT deposit invoice + a PENDING recurring plan (you review and send).
--   project stage -> 'live'   -> DRAFT balance invoice, plan becomes ACTIVE, first monthly invoice drafted.
--   daily cron                -> generate_due_monthly_invoices() drafts each month's invoice (idempotent).
--   send_invoice / mark_invoice_paid / void_invoice : admin-only functions. Browser has SELECT only.
--   get_invoice_by_token      : the client's private view (anon), includes EFT details until paid.
-- Money is integer cents. Invoice lines are COPIES, so later edits never change an issued invoice.
-- Payment is EFT only: no card data is handled anywhere.

ALTER TABLE public.business_settings
  ADD COLUMN default_invoice_due_days integer NOT NULL DEFAULT 7 CHECK (default_invoice_due_days BETWEEN 0 AND 120);

-- ── numbering: internal (no admin check) + public admin-only wrapper ────────
CREATE OR REPLACE FUNCTION public._next_document_number(p_kind text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  yr int := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Africa/Johannesburg'))::int;
  n  int;
  prefix text;
BEGIN
  IF p_kind = 'quote' THEN prefix := 'Q';
  ELSIF p_kind = 'invoice' THEN prefix := 'INV';
  ELSE RAISE EXCEPTION 'unknown document kind %', p_kind;
  END IF;
  INSERT INTO public.document_counters (kind, year, last_no) VALUES (p_kind, yr, 1)
  ON CONFLICT (kind, year) DO UPDATE SET last_no = public.document_counters.last_no + 1
  RETURNING last_no INTO n;
  RETURN prefix || '-' || yr || '-' || lpad(n::text, 4, '0');
END $$;
REVOKE ALL ON FUNCTION public._next_document_number(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.next_document_number(p_kind text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  RETURN public._next_document_number(p_kind);
END $$;

-- rounded-half-up percentage in integer cents (matches src/lib/money.ts percentOfCents)
CREATE OR REPLACE FUNCTION public._pct_cents(amount bigint, bps integer)
RETURNS bigint LANGUAGE sql IMMUTABLE AS $$ SELECT (amount * bps + 5000) / 10000 $$;

-- ── tables ──────────────────────────────────────────────────────────────────
CREATE TABLE public.recurring_plans (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  project_id        uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  quote_id          uuid NOT NULL UNIQUE REFERENCES public.quotes(id) ON DELETE RESTRICT,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'cancelled')),
  vat_rate_bps      integer NOT NULL CHECK (vat_rate_bps BETWEEN 0 AND 3000),
  anchor_day        smallint CHECK (anchor_day BETWEEN 1 AND 28),
  start_date        date,
  next_invoice_date date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.invoices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number            text NOT NULL UNIQUE,
  client_id         uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  project_id        uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  quote_id          uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  recurring_plan_id uuid REFERENCES public.recurring_plans(id) ON DELETE SET NULL,
  kind              text NOT NULL CHECK (kind IN ('deposit', 'balance', 'monthly')),
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'void')),
  issue_date        date NOT NULL,
  due_date          date NOT NULL,
  period_start      date,
  vat_rate_bps      integer NOT NULL CHECK (vat_rate_bps BETWEEN 0 AND 3000),
  subtotal_cents    integer NOT NULL CHECK (subtotal_cents >= 0),
  vat_cents         integer NOT NULL CHECK (vat_cents >= 0),
  total_cents       integer NOT NULL,
  notes             text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  token_hash        text UNIQUE,
  sent_at           timestamptz,
  sent_to_email     text,
  viewed_at         timestamptz,
  paid_on           date,
  payment_reference text CHECK (char_length(payment_reference) <= 100),
  voided_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (total_cents = subtotal_cents + vat_cents),
  CHECK ((kind = 'monthly') = (period_start IS NOT NULL))
);
-- One deposit and one balance per quote, one monthly invoice per plan per period.
-- (Voided invoices still block regeneration: handle those by hand, never silently re-bill.)
CREATE UNIQUE INDEX uq_invoice_quote_kind ON public.invoices (quote_id, kind) WHERE kind IN ('deposit', 'balance');
CREATE UNIQUE INDEX uq_invoice_plan_period ON public.invoices (recurring_plan_id, period_start) WHERE kind = 'monthly';
CREATE INDEX idx_invoices_client ON public.invoices (client_id, created_at DESC);

CREATE TABLE public.invoice_lines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  name             text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description      text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  quantity         integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 1000),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  sort_order       integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_invoice_lines_invoice ON public.invoice_lines (invoice_id, sort_order);

CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_recurring_plans_updated_at BEFORE UPDATE ON public.recurring_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.recurring_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines   ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recurring_plans, public.invoices, public.invoice_lines FROM anon, authenticated;
-- Read-only from the browser: every change goes through the admin-checked functions below.
GRANT SELECT ON public.recurring_plans, public.invoices, public.invoice_lines TO authenticated;
CREATE POLICY admin_select ON public.recurring_plans FOR SELECT TO authenticated USING (is_platform_admin());
CREATE POLICY admin_select ON public.invoices        FOR SELECT TO authenticated USING (is_platform_admin());
CREATE POLICY admin_select ON public.invoice_lines   FOR SELECT TO authenticated USING (is_platform_admin());

-- ── internal builders (no grants: only called by the SECURITY DEFINER functions) ──
CREATE OR REPLACE FUNCTION public._due_days()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT default_invoice_due_days FROM public.business_settings WHERE id = 1
$$;

CREATE OR REPLACE FUNCTION public._sast_today()
RETURNS date LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'Africa/Johannesburg')::date $$;

-- Draft monthly invoice for one plan period; copies the quote's monthly lines. Returns true if created.
CREATE OR REPLACE FUNCTION public._create_monthly_invoice(p_plan_id uuid, p_period_start date)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  pl public.recurring_plans%ROWTYPE;
  inv_id uuid;
  sub bigint;
BEGIN
  SELECT * INTO pl FROM public.recurring_plans WHERE id = p_plan_id;
  SELECT COALESCE(sum(quantity::bigint * unit_price_cents), 0) INTO sub
    FROM public.quote_lines WHERE quote_id = pl.quote_id AND kind = 'monthly';
  IF sub = 0 THEN RETURN false; END IF;

  INSERT INTO public.invoices (number, client_id, project_id, quote_id, recurring_plan_id, kind, issue_date, due_date,
                               period_start, vat_rate_bps, subtotal_cents, vat_cents, total_cents)
  VALUES (public._next_document_number('invoice'), pl.client_id, pl.project_id, pl.quote_id, pl.id, 'monthly',
          p_period_start, p_period_start + public._due_days(), p_period_start, pl.vat_rate_bps,
          sub, public._pct_cents(sub, pl.vat_rate_bps), sub + public._pct_cents(sub, pl.vat_rate_bps))
  ON CONFLICT (recurring_plan_id, period_start) WHERE kind = 'monthly' DO NOTHING
  RETURNING id INTO inv_id;
  IF inv_id IS NULL THEN RETURN false; END IF;

  INSERT INTO public.invoice_lines (invoice_id, name, description, quantity, unit_price_cents, sort_order)
  SELECT inv_id, name, description, quantity, unit_price_cents, sort_order
    FROM public.quote_lines WHERE quote_id = pl.quote_id AND kind = 'monthly';

  INSERT INTO public.activity_log (entity_type, entity_id, event, detail, actor)
  VALUES ('invoice', inv_id, 'invoice_created', jsonb_build_object('kind', 'monthly', 'period_start', p_period_start), NULL);
  RETURN true;
END $$;

-- Drafts every monthly invoice that has come due for one plan (catches up if the cron missed days).
CREATE OR REPLACE FUNCTION public._generate_due_for_plan(p_plan_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  pl public.recurring_plans%ROWTYPE;
  made int := 0;
  guard int := 0;
BEGIN
  SELECT * INTO pl FROM public.recurring_plans WHERE id = p_plan_id FOR UPDATE;
  WHILE pl.status = 'active' AND pl.next_invoice_date <= public._sast_today() AND guard < 36 LOOP
    IF public._create_monthly_invoice(pl.id, pl.next_invoice_date) THEN made := made + 1; END IF;
    pl.next_invoice_date := (date_trunc('month', pl.next_invoice_date + interval '1 month'))::date + (pl.anchor_day - 1);
    guard := guard + 1;
  END LOOP;
  UPDATE public.recurring_plans SET next_invoice_date = pl.next_invoice_date WHERE id = pl.id;
  RETURN made;
END $$;

-- Called by the daily cron (service role only).
CREATE OR REPLACE FUNCTION public.generate_due_monthly_invoices()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE r record; total int := 0;
BEGIN
  FOR r IN SELECT id FROM public.recurring_plans WHERE status = 'active' AND next_invoice_date <= public._sast_today() LOOP
    total := total + public._generate_due_for_plan(r.id);
  END LOOP;
  RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.generate_due_monthly_invoices() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_due_monthly_invoices() TO service_role;

-- Balance invoice for an accepted quote (idempotent).
CREATE OR REPLACE FUNCTION public._create_balance_invoice(p_quote_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  q public.quotes%ROWTYPE;
  once bigint; dep bigint; bal bigint; vat bigint; inv_id uuid;
BEGIN
  SELECT * INTO q FROM public.quotes WHERE id = p_quote_id AND status = 'accepted';
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT COALESCE(sum(quantity::bigint * unit_price_cents), 0) INTO once FROM public.quote_lines WHERE quote_id = q.id AND kind = 'once_off';
  dep := public._pct_cents(once, q.deposit_percent * 100);
  bal := once - dep;
  IF bal <= 0 THEN RETURN false; END IF;
  vat := public._pct_cents(once, q.vat_rate_bps) - public._pct_cents(dep, q.vat_rate_bps);

  INSERT INTO public.invoices (number, client_id, project_id, quote_id, kind, issue_date, due_date, vat_rate_bps, subtotal_cents, vat_cents, total_cents)
  VALUES (public._next_document_number('invoice'), q.client_id, q.project_id, q.id, 'balance',
          public._sast_today(), public._sast_today() + public._due_days(), q.vat_rate_bps, bal, vat, bal + vat)
  ON CONFLICT (quote_id, kind) WHERE kind IN ('deposit', 'balance') DO NOTHING
  RETURNING id INTO inv_id;
  IF inv_id IS NULL THEN RETURN false; END IF;

  INSERT INTO public.invoice_lines (invoice_id, name, description, quantity, unit_price_cents)
  VALUES (inv_id, 'Balance of website build on launch', 'Quotation ' || q.number || ': remaining ' || (100 - q.deposit_percent) || '% of the once-off build.', 1, bal);
  INSERT INTO public.activity_log (entity_type, entity_id, event, detail, actor)
  VALUES ('invoice', inv_id, 'invoice_created', jsonb_build_object('kind', 'balance'), NULL);
  RETURN true;
END $$;

-- Project went live: balance invoice for each accepted quote, activate the plan, draft the first monthly invoice.
CREATE OR REPLACE FUNCTION public._activate_project_billing(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE r record; today date := public._sast_today();
BEGIN
  FOR r IN SELECT q.id AS quote_id, pl.id AS plan_id, pl.status AS plan_status
             FROM public.quotes q LEFT JOIN public.recurring_plans pl ON pl.quote_id = q.id
            WHERE q.project_id = p_project_id AND q.status = 'accepted' LOOP
    PERFORM public._create_balance_invoice(r.quote_id);
    IF r.plan_id IS NOT NULL AND r.plan_status = 'pending' THEN
      UPDATE public.recurring_plans
         SET status = 'active', start_date = today, anchor_day = LEAST(EXTRACT(DAY FROM today)::int, 28), next_invoice_date = today
       WHERE id = r.plan_id;
      PERFORM public._generate_due_for_plan(r.plan_id);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.on_project_stage_live()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.stage = 'live' AND OLD.stage IS DISTINCT FROM 'live' THEN
    PERFORM public._activate_project_billing(NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_project_live AFTER UPDATE OF stage ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.on_project_stage_live();

-- Acceptance: deposit invoice + pending plan (and, if the project is already live, the rest).
CREATE OR REPLACE FUNCTION public._create_acceptance_invoices(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  q public.quotes%ROWTYPE;
  once bigint; monthly bigint; dep bigint; vat bigint; inv_id uuid;
BEGIN
  SELECT * INTO q FROM public.quotes WHERE id = p_quote_id AND status = 'accepted';
  IF NOT FOUND THEN RETURN; END IF;
  SELECT COALESCE(sum(quantity::bigint * unit_price_cents) FILTER (WHERE kind = 'once_off'), 0),
         COALESCE(sum(quantity::bigint * unit_price_cents) FILTER (WHERE kind = 'monthly'), 0)
    INTO once, monthly FROM public.quote_lines WHERE quote_id = q.id;

  IF monthly > 0 THEN
    INSERT INTO public.recurring_plans (client_id, project_id, quote_id, vat_rate_bps)
    VALUES (q.client_id, q.project_id, q.id, q.vat_rate_bps)
    ON CONFLICT (quote_id) DO NOTHING;
  END IF;

  dep := public._pct_cents(once, q.deposit_percent * 100);
  IF dep > 0 THEN
    vat := public._pct_cents(dep, q.vat_rate_bps);
    INSERT INTO public.invoices (number, client_id, project_id, quote_id, kind, issue_date, due_date, vat_rate_bps, subtotal_cents, vat_cents, total_cents)
    VALUES (public._next_document_number('invoice'), q.client_id, q.project_id, q.id, 'deposit',
            public._sast_today(), public._sast_today() + public._due_days(), q.vat_rate_bps, dep, vat, dep + vat)
    ON CONFLICT (quote_id, kind) WHERE kind IN ('deposit', 'balance') DO NOTHING
    RETURNING id INTO inv_id;
    IF inv_id IS NOT NULL THEN
      INSERT INTO public.invoice_lines (invoice_id, name, description, quantity, unit_price_cents)
      VALUES (inv_id, 'Deposit (' || q.deposit_percent || '% of once-off build)', 'Quotation ' || q.number, 1, dep);
      INSERT INTO public.activity_log (entity_type, entity_id, event, detail, actor)
      VALUES ('invoice', inv_id, 'invoice_created', jsonb_build_object('kind', 'deposit'), NULL);
    END IF;
  END IF;

  IF q.project_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.projects WHERE id = q.project_id AND stage = 'live') THEN
    PERFORM public._activate_project_billing(q.project_id);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public._due_days(), public._sast_today(), public._create_monthly_invoice(uuid, date),
  public._generate_due_for_plan(uuid), public._create_balance_invoice(uuid), public._activate_project_billing(uuid),
  public._create_acceptance_invoices(uuid), public.on_project_stage_live() FROM PUBLIC, anon, authenticated;

-- accept_quote: unchanged behaviour plus invoice creation (same transaction).
CREATE OR REPLACE FUNCTION public.accept_quote(p_token text, p_name text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  q public.quotes%ROWTYPE;
  clean_name text := btrim(regexp_replace(COALESCE(p_name, ''), '\s+', ' ', 'g'));
  content text;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF char_length(clean_name) < 2 OR char_length(clean_name) > 120 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_name');
  END IF;

  SELECT * INTO q FROM public.quotes WHERE token_hash = encode(digest(p_token, 'sha256'), 'hex') FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  IF q.status = 'accepted' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'accepted_at', q.accepted_at, 'accepted_name', q.accepted_name);
  END IF;
  IF q.status NOT IN ('sent', 'viewed') THEN
    RETURN jsonb_build_object('ok', false, 'reason', q.status);
  END IF;
  IF q.valid_until < (now() AT TIME ZONE 'Africa/Johannesburg')::date THEN
    UPDATE public.quotes SET status = 'expired' WHERE id = q.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  SELECT q.number || '|' || q.deposit_percent || '|' || q.vat_rate_bps || '|' || q.intro || '|' || q.terms || '|' ||
         COALESCE(string_agg(l.kind || ':' || l.name || ':' || l.description || ':' || l.quantity || ':' || l.unit_price_cents, ';'
                             ORDER BY l.kind, l.sort_order, l.id), '')
    INTO content FROM public.quote_lines l WHERE l.quote_id = q.id;

  UPDATE public.quotes
     SET status = 'accepted', accepted_at = now(), accepted_name = clean_name,
         accepted_content_hash = encode(digest(content, 'sha256'), 'hex')
   WHERE id = q.id;

  INSERT INTO public.activity_log (entity_type, entity_id, event, detail, actor)
  VALUES ('quote', q.id, 'quote_accepted', jsonb_build_object('name', clean_name), NULL);

  PERFORM public._create_acceptance_invoices(q.id);

  RETURN jsonb_build_object('ok', true, 'already', false, 'accepted_at', now(), 'accepted_name', clean_name);
END $$;

-- ── admin actions ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.send_invoice(p_invoice_id uuid, p_to_email text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  inv public.invoices%ROWTYPE;
  b public.business_settings%ROWTYPE;
  token text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501'; END IF;
  IF p_to_email IS NULL OR p_to_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' OR char_length(p_to_email) > 254 THEN
    RAISE EXCEPTION 'valid recipient email required';
  END IF;
  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice not found'; END IF;
  IF inv.status NOT IN ('draft', 'sent') THEN RAISE EXCEPTION 'invoice is % and cannot be sent', inv.status; END IF;

  SELECT * INTO b FROM public.business_settings WHERE id = 1;
  IF b.bank_name = '' OR b.account_holder = '' OR b.account_number = '' OR b.branch_code = '' THEN
    RAISE EXCEPTION 'bank details are not set in business settings';
  END IF;

  token := encode(gen_random_bytes(32), 'hex');
  UPDATE public.invoices
     SET token_hash = encode(digest(token, 'sha256'), 'hex'), status = 'sent', sent_at = now(), sent_to_email = p_to_email
   WHERE id = inv.id;
  INSERT INTO public.activity_log (entity_type, entity_id, event, detail, actor)
  VALUES ('invoice', inv.id, CASE WHEN inv.status = 'draft' THEN 'invoice_sent' ELSE 'invoice_resent' END,
          jsonb_build_object('to', p_to_email), auth.uid());
  RETURN token;
END $$;

CREATE OR REPLACE FUNCTION public.mark_invoice_paid(p_invoice_id uuid, p_paid_on date, p_reference text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE inv public.invoices%ROWTYPE; ref text := NULLIF(btrim(COALESCE(p_reference, '')), '');
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501'; END IF;
  IF p_paid_on IS NULL OR p_paid_on > public._sast_today() THEN RAISE EXCEPTION 'paid date cannot be in the future'; END IF;
  IF ref IS NOT NULL AND char_length(ref) > 100 THEN RAISE EXCEPTION 'reference too long'; END IF;
  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice not found'; END IF;
  IF inv.status NOT IN ('draft', 'sent') THEN RAISE EXCEPTION 'invoice is % and cannot be marked paid', inv.status; END IF;
  UPDATE public.invoices SET status = 'paid', paid_on = p_paid_on, payment_reference = ref WHERE id = inv.id;
  INSERT INTO public.activity_log (entity_type, entity_id, event, detail, actor)
  VALUES ('invoice', inv.id, 'invoice_paid', jsonb_build_object('paid_on', p_paid_on, 'reference', ref), auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.void_invoice(p_invoice_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE inv public.invoices%ROWTYPE;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501'; END IF;
  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice not found'; END IF;
  IF inv.status NOT IN ('draft', 'sent') THEN RAISE EXCEPTION 'invoice is % and cannot be voided', inv.status; END IF;
  UPDATE public.invoices SET status = 'void', voided_at = now() WHERE id = inv.id;
  INSERT INTO public.activity_log (entity_type, entity_id, event, detail, actor)
  VALUES ('invoice', inv.id, 'invoice_voided', jsonb_build_object('reason', left(COALESCE(p_reason, ''), 300)), auth.uid());
END $$;

-- ── the client's private view ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_invoice_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  inv public.invoices%ROWTYPE;
  c public.clients%ROWTYPE;
  b public.business_settings%ROWTYPE;
  lines jsonb;
  show_bank boolean;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO inv FROM public.invoices WHERE token_hash = encode(digest(p_token, 'sha256'), 'hex') FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF inv.status = 'sent' AND inv.viewed_at IS NULL THEN
    UPDATE public.invoices SET viewed_at = now() WHERE id = inv.id;
    INSERT INTO public.activity_log (entity_type, entity_id, event, actor) VALUES ('invoice', inv.id, 'invoice_viewed', NULL);
  END IF;

  SELECT * INTO c FROM public.clients WHERE id = inv.client_id;
  SELECT * INTO b FROM public.business_settings WHERE id = 1;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'description', description, 'quantity', quantity,
                   'unit_price_cents', unit_price_cents) ORDER BY sort_order, id), '[]'::jsonb)
    INTO lines FROM public.invoice_lines WHERE invoice_id = inv.id;
  show_bank := inv.status = 'sent';

  RETURN jsonb_build_object(
    'number', inv.number, 'kind', inv.kind, 'status', inv.status,
    'issue_date', inv.issue_date, 'due_date', inv.due_date, 'period_start', inv.period_start,
    'vat_rate_bps', inv.vat_rate_bps, 'subtotal_cents', inv.subtotal_cents, 'vat_cents', inv.vat_cents,
    'total_cents', inv.total_cents, 'notes', inv.notes, 'paid_on', inv.paid_on,
    'client', jsonb_build_object('company_name', c.company_name, 'billing_address', c.billing_address, 'vat_number', c.vat_number),
    'business', jsonb_build_object('legal_name', b.legal_name, 'registration_number', b.registration_number,
      'vat_registered', b.vat_registered, 'vat_number', b.vat_number, 'address', b.address, 'email', b.email, 'phone', b.phone),
    'bank', CASE WHEN show_bank THEN jsonb_build_object('bank_name', b.bank_name, 'account_holder', b.account_holder,
      'account_number', b.account_number, 'branch_code', b.branch_code) ELSE NULL END,
    'lines', lines
  );
END $$;

REVOKE ALL ON FUNCTION public.send_invoice(uuid, text), public.mark_invoice_paid(uuid, date, text), public.void_invoice(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_invoice_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_invoice(uuid, text), public.mark_invoice_paid(uuid, date, text), public.void_invoice(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invoice_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_quote(text, text) TO anon, authenticated;
