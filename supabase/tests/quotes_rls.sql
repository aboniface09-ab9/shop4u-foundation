-- Run on DEV after 20261115000003_quotes.sql. Fictional data; rolls back.
-- Final RAISE 'ALL CHECKS PASSED' forces rollback when run through a tool.
BEGIN;
INSERT INTO auth.users (id, aud, role, email) VALUES
  ('00000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'qadmin@example.com'),
  ('00000000-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'qother@example.com');
INSERT INTO public.platform_admins (auth_user_id) VALUES ('00000000-0000-0000-0000-0000000000e1');
INSERT INTO public.clients (id, company_name) VALUES ('00000000-0000-0000-0000-0000000000f1', 'Example Co');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
DO $$
DECLARE n1 text; n2 text; qid uuid; c int;
BEGIN
  n1 := public.next_document_number('quote');
  n2 := public.next_document_number('quote');
  IF n1 !~ '^Q-\d{4}-\d{4}$' THEN RAISE EXCEPTION 'FAIL: bad number format %', n1; END IF;
  IF split_part(n2,'-',3)::int <> split_part(n1,'-',3)::int + 1 THEN RAISE EXCEPTION 'FAIL: not sequential % %', n1, n2; END IF;

  INSERT INTO public.quotes (number, client_id, valid_until) VALUES (n1, '00000000-0000-0000-0000-0000000000f1', current_date + 30) RETURNING id INTO qid;
  INSERT INTO public.quote_lines (quote_id, kind, name, unit_price_cents) VALUES (qid, 'once_off', 'Design', 500000);

  BEGIN
    INSERT INTO public.quotes (number, client_id, valid_until, status) VALUES (n2, '00000000-0000-0000-0000-0000000000f1', current_date, 'accepted');
    RAISE EXCEPTION 'FAIL: admin inserted a non-draft quote';
  EXCEPTION WHEN insufficient_privilege OR others THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;

  -- lock: once sent (service role does this in Phase 4; simulate as owner)
  RESET ROLE;
  UPDATE public.quotes SET status = 'sent' WHERE id = qid;
  SET LOCAL ROLE authenticated;
  UPDATE public.quote_lines SET unit_price_cents = 1 WHERE quote_id = qid;
  GET DIAGNOSTICS c = ROW_COUNT;
  IF c <> 0 THEN RAISE EXCEPTION 'FAIL: edited a line on a sent quote'; END IF;
  UPDATE public.quotes SET valid_until = current_date WHERE id = qid;
  GET DIAGNOSTICS c = ROW_COUNT;
  IF c <> 0 THEN RAISE EXCEPTION 'FAIL: edited a sent quote'; END IF;
  DELETE FROM public.quotes WHERE id = qid;
  GET DIAGNOSTICS c = ROW_COUNT;
  IF c <> 0 THEN RAISE EXCEPTION 'FAIL: deleted a sent quote'; END IF;
  BEGIN
    PERFORM 1 FROM public.document_counters;
    RAISE EXCEPTION 'FAIL: admin read counters directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
DO $$
DECLARE c int;
BEGIN
  BEGIN
    PERFORM public.next_document_number('quote');
    RAISE EXCEPTION 'FAIL: non-admin generated a number';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  SELECT count(*) INTO c FROM public.quotes;          IF c <> 0 THEN RAISE EXCEPTION 'FAIL: non-admin read quotes'; END IF;
  SELECT count(*) INTO c FROM public.quote_lines;     IF c <> 0 THEN RAISE EXCEPTION 'FAIL: non-admin read lines'; END IF;
  SELECT count(*) INTO c FROM public.business_settings; IF c <> 0 THEN RAISE EXCEPTION 'FAIL: non-admin read settings'; END IF;
  SELECT count(*) INTO c FROM public.price_list_items; IF c <> 0 THEN RAISE EXCEPTION 'FAIL: non-admin read price list'; END IF;
END $$;

RESET request.jwt.claims;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.quotes;
    RAISE EXCEPTION 'FAIL: anon could query quotes';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE EXCEPTION 'ALL CHECKS PASSED';
END $$;
ROLLBACK;
