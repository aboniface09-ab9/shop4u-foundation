-- Run on DEV after 20261115000005_invoices.sql. Fictional data; rolls back.
-- Final RAISE 'ALL CHECKS PASSED' forces rollback when run through a tool.
BEGIN;

INSERT INTO auth.users (id, aud, role, email) VALUES
  ('00000000-0000-0000-0000-0000000001a1', 'authenticated', 'authenticated', 'iadmin@example.com'),
  ('00000000-0000-0000-0000-0000000001a2', 'authenticated', 'authenticated', 'iother@example.com');
INSERT INTO public.platform_admins (auth_user_id) VALUES ('00000000-0000-0000-0000-0000000001a1');
INSERT INTO public.clients (id, company_name) VALUES ('00000000-0000-0000-0000-0000000001b1', 'Example Co');
INSERT INTO public.projects (id, client_id, name, stage) VALUES
  ('00000000-0000-0000-0000-0000000001c1', '00000000-0000-0000-0000-0000000001b1', 'Example site', 'build');

-- Quote A: the Ultra Fish figures, no VAT, on the project. Quote B: 15% VAT with odd cents, no project.
INSERT INTO public.quotes (id, number, client_id, project_id, valid_until, deposit_percent, vat_rate_bps) VALUES
  ('00000000-0000-0000-0000-0000000001d1', 'Q-T-A', '00000000-0000-0000-0000-0000000001b1', '00000000-0000-0000-0000-0000000001c1', current_date + 20, 50, 0),
  ('00000000-0000-0000-0000-0000000001d2', 'Q-T-B', '00000000-0000-0000-0000-0000000001b1', NULL, current_date + 20, 50, 1500),
  ('00000000-0000-0000-0000-0000000001d3', 'Q-T-C', '00000000-0000-0000-0000-0000000001b1', '00000000-0000-0000-0000-0000000001c1', current_date + 20, 50, 0);
INSERT INTO public.quote_lines (quote_id, kind, name, quantity, unit_price_cents, sort_order) VALUES
  ('00000000-0000-0000-0000-0000000001d1', 'once_off', 'Discovery', 1, 250000, 1),
  ('00000000-0000-0000-0000-0000000001d1', 'once_off', 'Design', 1, 500000, 2),
  ('00000000-0000-0000-0000-0000000001d1', 'once_off', 'Build', 1, 800000, 3),
  ('00000000-0000-0000-0000-0000000001d1', 'once_off', 'Catalogue', 1, 150000, 4),
  ('00000000-0000-0000-0000-0000000001d1', 'once_off', 'Contact form', 1, 200000, 5),
  ('00000000-0000-0000-0000-0000000001d1', 'once_off', 'SEO', 1, 200000, 6),
  ('00000000-0000-0000-0000-0000000001d1', 'once_off', 'Launch', 1, 150000, 7),
  ('00000000-0000-0000-0000-0000000001d1', 'monthly', 'Hosting', 1, 25000, 11),
  ('00000000-0000-0000-0000-0000000001d1', 'monthly', 'Maintenance', 1, 25000, 12),
  ('00000000-0000-0000-0000-0000000001d1', 'monthly', 'Content', 1, 25000, 13),
  ('00000000-0000-0000-0000-0000000001d2', 'once_off', 'Odd', 1, 100001, 1),
  ('00000000-0000-0000-0000-0000000001d2', 'monthly', 'Hosting', 1, 33333, 2),
  ('00000000-0000-0000-0000-0000000001d3', 'once_off', 'Small', 1, 100000, 1),
  ('00000000-0000-0000-0000-0000000001d3', 'monthly', 'Hosting', 1, 10000, 2);

-- send + accept each quote (admin claims are enough for send_quote; accept is anon-callable)
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000001a1","role":"authenticated"}', true);
DO $$
DECLARE tok text; q uuid; r jsonb;
BEGIN
  FOREACH q IN ARRAY ARRAY['00000000-0000-0000-0000-0000000001d1','00000000-0000-0000-0000-0000000001d2']::uuid[] LOOP
    tok := public.send_quote(q, 'client@example.com');
    r := public.accept_quote(tok, 'Pat Example');
    IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL: accept failed %', r; END IF;
    IF q = '00000000-0000-0000-0000-0000000001d1' THEN
      -- idempotent second accept
      PERFORM public.accept_quote(tok, 'Pat Example');
    END IF;
  END LOOP;
END $$;

-- (1) acceptance: exactly one DRAFT deposit invoice, a PENDING plan, nothing else; second accept changed nothing
DO $$
DECLARE n int; inv public.invoices%ROWTYPE; pl public.recurring_plans%ROWTYPE;
BEGIN
  SELECT count(*) INTO n FROM public.invoices WHERE quote_id = '00000000-0000-0000-0000-0000000001d1';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: expected 1 invoice after accept, got %', n; END IF;
  SELECT * INTO inv FROM public.invoices WHERE quote_id = '00000000-0000-0000-0000-0000000001d1';
  IF inv.kind <> 'deposit' OR inv.status <> 'draft' OR inv.subtotal_cents <> 1125000 OR inv.vat_cents <> 0 OR inv.total_cents <> 1125000 THEN
    RAISE EXCEPTION 'FAIL: bad deposit invoice %', row_to_json(inv);
  END IF;
  IF inv.number !~ '^INV-\d{4}-\d{4}$' THEN RAISE EXCEPTION 'FAIL: bad invoice number %', inv.number; END IF;
  SELECT * INTO pl FROM public.recurring_plans WHERE quote_id = '00000000-0000-0000-0000-0000000001d1';
  IF pl.status <> 'pending' OR pl.start_date IS NOT NULL THEN RAISE EXCEPTION 'FAIL: plan should be pending %', row_to_json(pl); END IF;
END $$;

-- (2) VAT split: deposit VAT + balance VAT = once-off VAT exactly, with odd cents
DO $$
DECLARE dep public.invoices%ROWTYPE; bal public.invoices%ROWTYPE; once_vat bigint;
BEGIN
  PERFORM public._create_balance_invoice('00000000-0000-0000-0000-0000000001d2');
  SELECT * INTO dep FROM public.invoices WHERE quote_id = '00000000-0000-0000-0000-0000000001d2' AND kind = 'deposit';
  SELECT * INTO bal FROM public.invoices WHERE quote_id = '00000000-0000-0000-0000-0000000001d2' AND kind = 'balance';
  once_vat := public._pct_cents(100001, 1500);
  IF dep.subtotal_cents + bal.subtotal_cents <> 100001 THEN RAISE EXCEPTION 'FAIL: deposit + balance <> once-off (% + %)', dep.subtotal_cents, bal.subtotal_cents; END IF;
  IF dep.vat_cents + bal.vat_cents <> once_vat THEN RAISE EXCEPTION 'FAIL: VAT split off (% + % vs %)', dep.vat_cents, bal.vat_cents, once_vat; END IF;
  IF dep.total_cents <> dep.subtotal_cents + dep.vat_cents THEN RAISE EXCEPTION 'FAIL: total <> subtotal + vat'; END IF;
  IF public._create_balance_invoice('00000000-0000-0000-0000-0000000001d2') THEN RAISE EXCEPTION 'FAIL: balance created twice'; END IF;
END $$;

-- (3) project goes live: balance invoice, plan active, first monthly invoice with the 3 copied lines
DO $$
DECLARE n int; pl public.recurring_plans%ROWTYPE; m public.invoices%ROWTYPE; lc int;
BEGIN
  UPDATE public.projects SET stage = 'live' WHERE id = '00000000-0000-0000-0000-0000000001c1';
  SELECT count(*) INTO n FROM public.invoices WHERE quote_id = '00000000-0000-0000-0000-0000000001d1';
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL: expected deposit + balance + first monthly = 3, got %', n; END IF;
  IF (SELECT subtotal_cents FROM public.invoices WHERE quote_id = '00000000-0000-0000-0000-0000000001d1' AND kind = 'balance') <> 1125000 THEN
    RAISE EXCEPTION 'FAIL: balance should be R11,250';
  END IF;
  SELECT * INTO pl FROM public.recurring_plans WHERE quote_id = '00000000-0000-0000-0000-0000000001d1';
  IF pl.status <> 'active' OR pl.start_date <> public._sast_today() OR pl.next_invoice_date <= public._sast_today() THEN
    RAISE EXCEPTION 'FAIL: plan not activated correctly %', row_to_json(pl);
  END IF;
  SELECT * INTO m FROM public.invoices WHERE recurring_plan_id = pl.id;
  IF m.kind <> 'monthly' OR m.subtotal_cents <> 75000 OR m.period_start <> pl.start_date THEN RAISE EXCEPTION 'FAIL: bad first monthly %', row_to_json(m); END IF;
  SELECT count(*) INTO lc FROM public.invoice_lines WHERE invoice_id = m.id;
  IF lc <> 3 THEN RAISE EXCEPTION 'FAIL: monthly invoice should copy 3 lines, got %', lc; END IF;

  -- toggling the stage again must not bill again
  UPDATE public.projects SET stage = 'build' WHERE id = '00000000-0000-0000-0000-0000000001c1';
  UPDATE public.projects SET stage = 'live' WHERE id = '00000000-0000-0000-0000-0000000001c1';
  SELECT count(*) INTO n FROM public.invoices WHERE quote_id = '00000000-0000-0000-0000-0000000001d1';
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL: re-entering live created duplicates (%)', n; END IF;
END $$;

-- (4) monthly generator: nothing due today; catches up exactly once after a missed stretch; locked to service role
DO $$
DECLARE made int; again int; pid uuid; per int;
BEGIN
  SELECT id INTO pid FROM public.recurring_plans WHERE quote_id = '00000000-0000-0000-0000-0000000001d1';
  made := public.generate_due_monthly_invoices();
  IF made <> 0 THEN RAISE EXCEPTION 'FAIL: nothing should be due yet, made %', made; END IF;

  UPDATE public.recurring_plans
     SET next_invoice_date = (date_trunc('month', public._sast_today() - interval '3 months'))::date + (anchor_day - 1)
   WHERE id = pid;
  made := public.generate_due_monthly_invoices();
  IF made < 3 OR made > 4 THEN RAISE EXCEPTION 'FAIL: expected 3-4 catch-up invoices, got %', made; END IF;
  again := public.generate_due_monthly_invoices();
  IF again <> 0 THEN RAISE EXCEPTION 'FAIL: second run created % more', again; END IF;
  SELECT count(*), count(DISTINCT period_start) INTO made, per FROM public.invoices WHERE recurring_plan_id = pid;
  IF made <> per THEN RAISE EXCEPTION 'FAIL: duplicate periods'; END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000001a1","role":"authenticated"}', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.generate_due_monthly_invoices();
    RAISE EXCEPTION 'FAIL: authenticated admin ran the generator directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.invoices SET status = 'paid';
    RAISE EXCEPTION 'FAIL: browser could write invoices';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- (5) quote accepted when its project is ALREADY live: balance + active plan straight away
DO $$
DECLARE tok text; n int; st text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000001a1","role":"authenticated"}', true);
  tok := public.send_quote('00000000-0000-0000-0000-0000000001d3', 'client@example.com');
  PERFORM public.accept_quote(tok, 'Pat Example');
  SELECT count(*) INTO n FROM public.invoices WHERE quote_id = '00000000-0000-0000-0000-0000000001d3';
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL: late-accepted quote should have deposit, balance and monthly, got %', n; END IF;
  SELECT status INTO st FROM public.recurring_plans WHERE quote_id = '00000000-0000-0000-0000-0000000001d3';
  IF st <> 'active' THEN RAISE EXCEPTION 'FAIL: plan should be active'; END IF;
END $$;

-- (6) send / view / pay / void
DO $$
DECLARE inv uuid; tok text; doc jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000001a1","role":"authenticated"}', true);
  SELECT id INTO inv FROM public.invoices WHERE quote_id = '00000000-0000-0000-0000-0000000001d1' AND kind = 'deposit';

  BEGIN
    PERFORM public.send_invoice(inv, 'client@example.com');
    RAISE EXCEPTION 'FAIL: sent an invoice with no bank details';
  EXCEPTION WHEN others THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;

  UPDATE public.business_settings SET bank_name = 'Example Bank', account_holder = 'Example (Pty) Ltd', account_number = '0000000000', branch_code = '000000' WHERE id = 1;
  tok := public.send_invoice(inv, 'client@example.com');
  IF tok !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'FAIL: bad invoice token'; END IF;
  IF (SELECT status FROM public.invoices WHERE id = inv) <> 'sent' THEN RAISE EXCEPTION 'FAIL: not sent'; END IF;
  IF (SELECT token_hash FROM public.invoices WHERE id = inv) = tok THEN RAISE EXCEPTION 'FAIL: plain token stored'; END IF;

  IF public.get_invoice_by_token('short') IS NOT NULL OR public.get_invoice_by_token(repeat('0', 64)) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: bad token returned data';
  END IF;
  doc := public.get_invoice_by_token(tok);
  IF doc->'bank'->>'account_holder' IS NULL OR doc->>'status' <> 'sent' THEN RAISE EXCEPTION 'FAIL: sent invoice should show bank details %', doc; END IF;
  IF doc ? 'id' OR doc ? 'token_hash' THEN RAISE EXCEPTION 'FAIL: internal fields leaked'; END IF;
  IF (SELECT viewed_at FROM public.invoices WHERE id = inv) IS NULL THEN RAISE EXCEPTION 'FAIL: not marked viewed'; END IF;

  BEGIN
    PERFORM public.mark_invoice_paid(inv, current_date + 5, 'ref');
    RAISE EXCEPTION 'FAIL: future paid date accepted';
  EXCEPTION WHEN others THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;

  PERFORM public.mark_invoice_paid(inv, public._sast_today(), '  EFT 1234  ');
  IF (SELECT payment_reference FROM public.invoices WHERE id = inv) <> 'EFT 1234' THEN RAISE EXCEPTION 'FAIL: reference not trimmed'; END IF;
  doc := public.get_invoice_by_token(tok);
  IF doc->>'status' <> 'paid' OR doc->'bank' <> 'null'::jsonb THEN RAISE EXCEPTION 'FAIL: paid invoice should hide bank details %', doc; END IF;

  BEGIN PERFORM public.mark_invoice_paid(inv, public._sast_today(), NULL); RAISE EXCEPTION 'FAIL: paid twice';
  EXCEPTION WHEN others THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;
  BEGIN PERFORM public.void_invoice(inv, 'x'); RAISE EXCEPTION 'FAIL: voided a paid invoice';
  EXCEPTION WHEN others THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;
  BEGIN PERFORM public.send_invoice(inv, 'client@example.com'); RAISE EXCEPTION 'FAIL: re-sent a paid invoice';
  EXCEPTION WHEN others THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;

  -- void a draft
  SELECT id INTO inv FROM public.invoices WHERE quote_id = '00000000-0000-0000-0000-0000000001d1' AND kind = 'balance';
  PERFORM public.void_invoice(inv, 'test');
  IF (SELECT status FROM public.invoices WHERE id = inv) <> 'void' THEN RAISE EXCEPTION 'FAIL: not voided'; END IF;
  -- a voided balance still blocks silent regeneration
  IF public._create_balance_invoice('00000000-0000-0000-0000-0000000001d1') THEN RAISE EXCEPTION 'FAIL: voided balance was regenerated'; END IF;
END $$;

-- (7) non-admin and anon cannot act
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000001a2","role":"authenticated"}', true);
DO $$
DECLARE inv uuid; c int;
BEGIN
  SELECT count(*) INTO c FROM public.invoices;      IF c <> 0 THEN RAISE EXCEPTION 'FAIL: non-admin read invoices'; END IF;
  SELECT count(*) INTO c FROM public.invoice_lines; IF c <> 0 THEN RAISE EXCEPTION 'FAIL: non-admin read lines'; END IF;
  SELECT count(*) INTO c FROM public.recurring_plans; IF c <> 0 THEN RAISE EXCEPTION 'FAIL: non-admin read plans'; END IF;
  inv := '00000000-0000-0000-0000-000000000000';
  BEGIN PERFORM public.send_invoice(inv, 'client@example.com'); RAISE EXCEPTION 'FAIL: non-admin sent';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.mark_invoice_paid(inv, current_date, NULL); RAISE EXCEPTION 'FAIL: non-admin marked paid';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.void_invoice(inv, NULL); RAISE EXCEPTION 'FAIL: non-admin voided';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET request.jwt.claims;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN PERFORM 1 FROM public.invoices; RAISE EXCEPTION 'FAIL: anon read invoices';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.send_invoice('00000000-0000-0000-0000-000000000000', 'a@example.com'); RAISE EXCEPTION 'FAIL: anon sent';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public._create_balance_invoice('00000000-0000-0000-0000-0000000001d1'); RAISE EXCEPTION 'FAIL: anon ran internal builder';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE EXCEPTION 'ALL CHECKS PASSED';
END $$;
ROLLBACK;
