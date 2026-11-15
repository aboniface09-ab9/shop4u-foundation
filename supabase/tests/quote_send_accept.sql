-- Run on DEV after 20261115000004_quote_send_accept.sql. Fictional data; rolls back.
-- Final RAISE 'ALL CHECKS PASSED' forces rollback when run through a tool.
BEGIN;
INSERT INTO auth.users (id, aud, role, email) VALUES
  ('00000000-0000-0000-0000-0000000000a9', 'authenticated', 'authenticated', 'sadmin@example.com'),
  ('00000000-0000-0000-0000-0000000000aa', 'authenticated', 'authenticated', 'sother@example.com');
INSERT INTO public.platform_admins (auth_user_id) VALUES ('00000000-0000-0000-0000-0000000000a9');
INSERT INTO public.clients (id, company_name) VALUES ('00000000-0000-0000-0000-0000000000b9', 'Example Co');
INSERT INTO public.quotes (id, number, client_id, valid_until) VALUES
  ('00000000-0000-0000-0000-0000000000c9', 'Q-TEST-0001', '00000000-0000-0000-0000-0000000000b9', current_date + 10),
  ('00000000-0000-0000-0000-0000000000ca', 'Q-TEST-0002', '00000000-0000-0000-0000-0000000000b9', current_date + 10),
  ('00000000-0000-0000-0000-0000000000cb', 'Q-TEST-0003', '00000000-0000-0000-0000-0000000000b9', current_date + 10);
INSERT INTO public.quote_lines (quote_id, kind, name, unit_price_cents) VALUES
  ('00000000-0000-0000-0000-0000000000c9', 'once_off', 'Design', 500000),
  ('00000000-0000-0000-0000-0000000000cb', 'once_off', 'Design', 500000);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    PERFORM public.send_quote('00000000-0000-0000-0000-0000000000c9', 'client@example.com');
    RAISE EXCEPTION 'FAIL: non-admin sent a quote';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a9","role":"authenticated"}';
DO $$
DECLARE tok text; st text; h text;
BEGIN
  BEGIN
    PERFORM public.send_quote('00000000-0000-0000-0000-0000000000ca', 'client@example.com');
    RAISE EXCEPTION 'FAIL: sent a quote with no lines';
  EXCEPTION WHEN others THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.send_quote('00000000-0000-0000-0000-0000000000c9', 'not-an-email');
    RAISE EXCEPTION 'FAIL: sent to an invalid email';
  EXCEPTION WHEN others THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;

  tok := public.send_quote('00000000-0000-0000-0000-0000000000c9', 'client@example.com');
  IF tok !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'FAIL: token format %', tok; END IF;
  SELECT status, token_hash INTO st, h FROM public.quotes WHERE id = '00000000-0000-0000-0000-0000000000c9';
  IF st <> 'sent' THEN RAISE EXCEPTION 'FAIL: status after send is %', st; END IF;
  IF h = tok OR h IS NULL OR length(h) <> 64 THEN RAISE EXCEPTION 'FAIL: plain token stored or hash missing'; END IF;
  PERFORM set_config('test.tok', tok, true);
END $$;

-- anon: the client's side
RESET request.jwt.claims;
SET LOCAL ROLE anon;
DO $$
DECLARE tok text := current_setting('test.tok'); doc jsonb; r jsonb; r2 jsonb;
BEGIN
  IF public.get_quote_by_token('short') IS NOT NULL THEN RAISE EXCEPTION 'FAIL: short token returned data'; END IF;
  IF public.get_quote_by_token(repeat('0', 64)) IS NOT NULL THEN RAISE EXCEPTION 'FAIL: wrong token returned data'; END IF;

  doc := public.get_quote_by_token(tok);
  IF doc IS NULL OR doc->>'number' <> 'Q-TEST-0001' THEN RAISE EXCEPTION 'FAIL: could not read own quote'; END IF;
  IF doc->>'status' <> 'viewed' THEN RAISE EXCEPTION 'FAIL: not marked viewed (%)', doc->>'status'; END IF;
  IF doc->'business' ? 'account_number' OR doc->'business' ? 'bank_name' THEN RAISE EXCEPTION 'FAIL: bank details leaked'; END IF;
  IF doc ? 'id' OR doc ? 'token_hash' THEN RAISE EXCEPTION 'FAIL: internal fields leaked'; END IF;
  IF jsonb_array_length(doc->'lines') <> 1 THEN RAISE EXCEPTION 'FAIL: wrong line count'; END IF;

  r := public.accept_quote(tok, 'A');
  IF (r->>'ok')::boolean OR r->>'reason' <> 'invalid_name' THEN RAISE EXCEPTION 'FAIL: one-letter name accepted'; END IF;
  r := public.accept_quote(repeat('1', 64), 'Pat Example');
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL: accepted with a wrong token'; END IF;

  r := public.accept_quote(tok, '  Pat   Example ');
  IF NOT (r->>'ok')::boolean OR r->>'accepted_name' <> 'Pat Example' THEN RAISE EXCEPTION 'FAIL: acceptance failed %', r; END IF;
  r2 := public.accept_quote(tok, 'Someone Else');
  IF NOT (r2->>'ok')::boolean OR NOT (r2->>'already')::boolean OR r2->>'accepted_name' <> 'Pat Example' OR r2->>'accepted_at' <> r->>'accepted_at' THEN
    RAISE EXCEPTION 'FAIL: second accept not idempotent %', r2;
  END IF;

  BEGIN
    PERFORM 1 FROM public.quotes;
    RAISE EXCEPTION 'FAIL: anon read quotes table';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.send_quote('00000000-0000-0000-0000-0000000000c9', 'client@example.com');
    RAISE EXCEPTION 'FAIL: anon sent a quote';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- admin cannot re-issue an accepted quote; audit rows exist
RESET ROLE;
DO $$
DECLARE n int; hsh text;
BEGIN
  SELECT count(*) INTO n FROM public.activity_log WHERE entity_id = '00000000-0000-0000-0000-0000000000c9' AND event IN ('quote_sent','quote_viewed','quote_accepted');
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL: expected 3 audit rows, got %', n; END IF;
  SELECT accepted_content_hash INTO hsh FROM public.quotes WHERE id = '00000000-0000-0000-0000-0000000000c9';
  IF hsh IS NULL OR length(hsh) <> 64 THEN RAISE EXCEPTION 'FAIL: content hash missing'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a9","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    PERFORM public.send_quote('00000000-0000-0000-0000-0000000000c9', 'client@example.com');
    RAISE EXCEPTION 'FAIL: re-sent an accepted quote';
  EXCEPTION WHEN others THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;
END $$;

-- expiry: a sent quote past its date cannot be accepted
RESET ROLE;
DO $$
DECLARE tok text; r jsonb; doc jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a9","role":"authenticated"}', true);
  tok := public.send_quote('00000000-0000-0000-0000-0000000000cb', 'client@example.com');
  RESET ROLE;
  UPDATE public.quotes SET valid_until = current_date - 1 WHERE id = '00000000-0000-0000-0000-0000000000cb';
  SET LOCAL ROLE anon;
  r := public.accept_quote(tok, 'Pat Example');
  IF (r->>'ok')::boolean OR r->>'reason' <> 'expired' THEN RAISE EXCEPTION 'FAIL: expired quote accepted %', r; END IF;
  RAISE EXCEPTION 'ALL CHECKS PASSED';
END $$;
ROLLBACK;
