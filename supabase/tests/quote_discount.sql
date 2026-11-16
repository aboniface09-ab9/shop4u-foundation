-- Run on DEV after 20261115000009_quote_discount.sql. Fictional data; rolls back.
-- Final RAISE 'ALL CHECKS PASSED' forces rollback when run through a tool.
BEGIN;

INSERT INTO auth.users (id, aud, role, email) VALUES
  ('00000000-0000-0000-0000-0000000009a1', 'authenticated', 'authenticated', 'dadmin@example.com'),
  ('00000000-0000-0000-0000-0000000009a2', 'authenticated', 'authenticated', 'dother@example.com');
INSERT INTO public.platform_admins (auth_user_id) VALUES ('00000000-0000-0000-0000-0000000009a1');
INSERT INTO public.clients (id, company_name) VALUES ('00000000-0000-0000-0000-0000000009b1', 'Example Co');
INSERT INTO public.projects (id, client_id, name, stage) VALUES
  ('00000000-0000-0000-0000-0000000009c1', '00000000-0000-0000-0000-0000000009b1', 'Example site', 'build');

-- QA: the Ultra Fish figures with a 15% referral discount, on a project.
-- QB: 15% VAT with awkward cents and a 15% discount, blank label.
-- QC: no discount at all (must behave exactly as before).
INSERT INTO public.quotes (id, number, client_id, project_id, valid_until, deposit_percent, vat_rate_bps, discount_percent, discount_label) VALUES
  ('00000000-0000-0000-0000-0000000009d1', 'Q-D-A', '00000000-0000-0000-0000-0000000009b1', '00000000-0000-0000-0000-0000000009c1', current_date + 20, 50, 0, 15, 'Referral discount'),
  ('00000000-0000-0000-0000-0000000009d2', 'Q-D-B', '00000000-0000-0000-0000-0000000009b1', NULL, current_date + 20, 50, 1500, 15, ''),
  ('00000000-0000-0000-0000-0000000009d3', 'Q-D-C', '00000000-0000-0000-0000-0000000009b1', NULL, current_date + 20, 50, 0, 0, '');
INSERT INTO public.quote_lines (quote_id, kind, name, quantity, unit_price_cents, sort_order) VALUES
  ('00000000-0000-0000-0000-0000000009d1', 'once_off', 'Discovery', 1, 250000, 1),
  ('00000000-0000-0000-0000-0000000009d1', 'once_off', 'Design', 1, 500000, 2),
  ('00000000-0000-0000-0000-0000000009d1', 'once_off', 'Build', 1, 800000, 3),
  ('00000000-0000-0000-0000-0000000009d1', 'once_off', 'Catalogue', 1, 150000, 4),
  ('00000000-0000-0000-0000-0000000009d1', 'once_off', 'Contact form', 1, 200000, 5),
  ('00000000-0000-0000-0000-0000000009d1', 'once_off', 'SEO', 1, 200000, 6),
  ('00000000-0000-0000-0000-0000000009d1', 'once_off', 'Launch', 1, 150000, 7),
  ('00000000-0000-0000-0000-0000000009d1', 'monthly', 'Hosting', 1, 25000, 11),
  ('00000000-0000-0000-0000-0000000009d1', 'monthly', 'Maintenance', 1, 25000, 12),
  ('00000000-0000-0000-0000-0000000009d1', 'monthly', 'Content', 1, 25000, 13),
  ('00000000-0000-0000-0000-0000000009d2', 'once_off', 'Odd', 1, 100001, 1),
  ('00000000-0000-0000-0000-0000000009d3', 'once_off', 'Plain', 1, 100000, 1);

-- constraints: a discount must be 0 to 100
DO $$
BEGIN
  BEGIN UPDATE public.quotes SET discount_percent = 101 WHERE number = 'Q-D-C'; RAISE EXCEPTION 'FAIL: 101 percent accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.quotes SET discount_percent = -1 WHERE number = 'Q-D-C'; RAISE EXCEPTION 'FAIL: minus 1 percent accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

-- ===== the quote the client sees carries the discount, and cannot be changed once sent =====
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000009a1","role":"authenticated"}', true);
DO $$
DECLARE tok text; q uuid; r jsonb; doc jsonb; hsh text; expected text; wrong text; c int;
BEGIN
  -- send all three
  FOREACH q IN ARRAY ARRAY['00000000-0000-0000-0000-0000000009d1','00000000-0000-0000-0000-0000000009d2','00000000-0000-0000-0000-0000000009d3']::uuid[] LOOP
    tok := public.send_quote(q, 'client@example.com');
    PERFORM set_config('test.tok_' || right(q::text, 1), tok, true);
  END LOOP;

  -- the client's document (as returned to the public page and PDF) includes the discount
  doc := public.get_quote_by_token(current_setting('test.tok_1'));
  IF (doc->>'discount_percent')::int <> 15 OR doc->>'discount_label' <> 'Referral discount' THEN
    RAISE EXCEPTION 'FAIL: client document is missing the discount %', doc;
  END IF;
  doc := public.get_quote_by_token(current_setting('test.tok_3'));
  IF (doc->>'discount_percent')::int <> 0 THEN RAISE EXCEPTION 'FAIL: undiscounted quote shows a discount'; END IF;

  -- once sent, even an admin cannot change the discount from the browser role
  SET LOCAL ROLE authenticated;
  UPDATE public.quotes SET discount_percent = 50 WHERE number = 'Q-D-A';
  GET DIAGNOSTICS c = ROW_COUNT;
  RESET ROLE;
  IF c <> 0 THEN RAISE EXCEPTION 'FAIL: a sent quote''s discount was editable'; END IF;
  IF (SELECT discount_percent FROM public.quotes WHERE number = 'Q-D-A') <> 15 THEN RAISE EXCEPTION 'FAIL: discount changed after sending'; END IF;

  -- accept all three
  FOREACH q IN ARRAY ARRAY['00000000-0000-0000-0000-0000000009d1','00000000-0000-0000-0000-0000000009d2','00000000-0000-0000-0000-0000000009d3']::uuid[] LOOP
    r := public.accept_quote(current_setting('test.tok_' || right(q::text, 1)), 'Pat Example');
    IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL: accept failed %', r; END IF;
  END LOOP;

  -- the acceptance fingerprint covers the discount (differs from the same quote with 0%)
  SELECT accepted_content_hash INTO hsh FROM public.quotes WHERE number = 'Q-D-A';
  expected := encode(extensions.digest(
           'Q-D-A|50|0|15|Referral discount|' || (SELECT intro FROM public.quotes WHERE number = 'Q-D-A') || '|' || (SELECT terms FROM public.quotes WHERE number = 'Q-D-A') || '|' ||
           (SELECT string_agg(l.kind || ':' || l.name || ':' || l.description || ':' || l.quantity || ':' || l.unit_price_cents, ';' ORDER BY l.kind, l.sort_order, l.id)
              FROM public.quote_lines l WHERE l.quote_id = '00000000-0000-0000-0000-0000000009d1'), 'sha256'), 'hex');
  wrong := encode(extensions.digest(
           'Q-D-A|50|0|0||' || (SELECT intro FROM public.quotes WHERE number = 'Q-D-A') || '|' || (SELECT terms FROM public.quotes WHERE number = 'Q-D-A') || '|' ||
           (SELECT string_agg(l.kind || ':' || l.name || ':' || l.description || ':' || l.quantity || ':' || l.unit_price_cents, ';' ORDER BY l.kind, l.sort_order, l.id)
              FROM public.quote_lines l WHERE l.quote_id = '00000000-0000-0000-0000-0000000009d1'), 'sha256'), 'hex');
  IF hsh <> expected THEN RAISE EXCEPTION 'FAIL: acceptance fingerprint does not include the discount'; END IF;
  IF hsh = wrong THEN RAISE EXCEPTION 'FAIL: fingerprint identical with and without a discount'; END IF;
END $$;

-- ===== Ultra Fish with 15% off: R22,500 -> R19,125; deposit R9,562.50; monthly untouched =====
DO $$
DECLARE dep public.invoices%ROWTYPE; bal public.invoices%ROWTYPE; m public.invoices%ROWTYPE; descr text;
BEGIN
  SELECT * INTO dep FROM public.invoices WHERE quote_id = '00000000-0000-0000-0000-0000000009d1' AND kind = 'deposit';
  IF dep.subtotal_cents <> 956250 OR dep.vat_cents <> 0 OR dep.total_cents <> 956250 THEN
    RAISE EXCEPTION 'FAIL: deposit should be R9,562.50 after the discount, got %', dep.subtotal_cents;
  END IF;
  SELECT description INTO descr FROM public.invoice_lines WHERE invoice_id = dep.id;
  IF descr NOT LIKE '%15% Referral discount%' THEN RAISE EXCEPTION 'FAIL: deposit invoice does not mention the discount: %', descr; END IF;

  -- go live: balance is the other half of the DISCOUNTED total; the monthly invoice is not discounted
  UPDATE public.projects SET stage = 'live' WHERE id = '00000000-0000-0000-0000-0000000009c1';
  SELECT * INTO bal FROM public.invoices WHERE quote_id = '00000000-0000-0000-0000-0000000009d1' AND kind = 'balance';
  IF bal.subtotal_cents <> 956250 THEN RAISE EXCEPTION 'FAIL: balance should be R9,562.50, got %', bal.subtotal_cents; END IF;
  IF dep.subtotal_cents + bal.subtotal_cents <> 1912500 THEN RAISE EXCEPTION 'FAIL: deposit + balance should be R19,125'; END IF;
  SELECT description INTO descr FROM public.invoice_lines WHERE invoice_id = bal.id;
  IF descr NOT LIKE '%after the 15% Referral discount%' THEN RAISE EXCEPTION 'FAIL: balance invoice does not mention the discount: %', descr; END IF;
  SELECT * INTO m FROM public.invoices WHERE quote_id = '00000000-0000-0000-0000-0000000009d1' AND kind = 'monthly';
  IF m.subtotal_cents <> 75000 THEN RAISE EXCEPTION 'FAIL: the monthly fee must NOT be discounted, got %', m.subtotal_cents; END IF;
END $$;

-- ===== VAT + discount + odd cents: deposit VAT + balance VAT = VAT on the discounted total, exactly =====
DO $$
DECLARE dep public.invoices%ROWTYPE; bal public.invoices%ROWTYPE; net bigint := 100001 - public._pct_cents(100001, 1500);
BEGIN
  PERFORM public._create_balance_invoice('00000000-0000-0000-0000-0000000009d2');
  SELECT * INTO dep FROM public.invoices WHERE quote_id = '00000000-0000-0000-0000-0000000009d2' AND kind = 'deposit';
  SELECT * INTO bal FROM public.invoices WHERE quote_id = '00000000-0000-0000-0000-0000000009d2' AND kind = 'balance';
  IF net <> 85001 THEN RAISE EXCEPTION 'FAIL: test arithmetic, net should be 85001, is %', net; END IF;
  IF dep.subtotal_cents + bal.subtotal_cents <> net THEN RAISE EXCEPTION 'FAIL: deposit + balance <> discounted total (% + % vs %)', dep.subtotal_cents, bal.subtotal_cents, net; END IF;
  IF dep.vat_cents + bal.vat_cents <> public._pct_cents(net, 1500) THEN RAISE EXCEPTION 'FAIL: VAT split off (% + % vs %)', dep.vat_cents, bal.vat_cents, public._pct_cents(net, 1500); END IF;
  IF dep.total_cents <> dep.subtotal_cents + dep.vat_cents OR bal.total_cents <> bal.subtotal_cents + bal.vat_cents THEN RAISE EXCEPTION 'FAIL: totals'; END IF;
END $$;

-- ===== no discount: exactly as before (deposit is half of the full R1,000.00) =====
DO $$
DECLARE dep public.invoices%ROWTYPE; descr text;
BEGIN
  SELECT * INTO dep FROM public.invoices WHERE quote_id = '00000000-0000-0000-0000-0000000009d3' AND kind = 'deposit';
  IF dep.subtotal_cents <> 50000 THEN RAISE EXCEPTION 'FAIL: an undiscounted deposit should be R500.00, got %', dep.subtotal_cents; END IF;
  SELECT description INTO descr FROM public.invoice_lines WHERE invoice_id = dep.id;
  IF descr LIKE '%discount%' THEN RAISE EXCEPTION 'FAIL: an undiscounted invoice mentions a discount: %', descr; END IF;
END $$;

-- ===== a different admin-less user cannot touch a draft quote's discount =====
INSERT INTO public.quotes (id, number, client_id, valid_until) VALUES
  ('00000000-0000-0000-0000-0000000009d4', 'Q-D-D', '00000000-0000-0000-0000-0000000009b1', current_date + 20);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000009a2","role":"authenticated"}', true);
DO $$
DECLARE c int;
BEGIN
  UPDATE public.quotes SET discount_percent = 99 WHERE number = 'Q-D-D';
  GET DIAGNOSTICS c = ROW_COUNT;
  IF c <> 0 THEN RAISE EXCEPTION 'FAIL: a non-admin changed a discount'; END IF;
END $$;

-- ===== the admin CAN set a discount on a draft =====
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000009a1","role":"authenticated"}', true);
DO $$
DECLARE c int;
BEGIN
  UPDATE public.quotes SET discount_percent = 12, discount_label = 'Launch offer' WHERE number = 'Q-D-D';
  GET DIAGNOSTICS c = ROW_COUNT;
  IF c <> 1 THEN RAISE EXCEPTION 'FAIL: admin could not set a discount on a draft'; END IF;
  RAISE EXCEPTION 'ALL CHECKS PASSED';
END $$;
ROLLBACK;
