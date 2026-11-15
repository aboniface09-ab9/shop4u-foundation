-- Run on the DEV database AFTER applying the hardening migration.
-- Uses fictional users/tenants; rolls back at the end. Every check raises an
-- exception on failure, so "ROLLBACK" being reached means all passed.
BEGIN;

INSERT INTO public.tenants (id, slug, name) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'test-a', 'Test A'),
  ('00000000-0000-0000-0000-0000000000a2', 'test-b', 'Test B');
INSERT INTO public.tenant_users (tenant_id, auth_user_id, role) VALUES
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'owner');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

DO $$
DECLARE n int;
BEGIN
  -- allowed: branding update on own tenant
  UPDATE public.tenants SET store_name = 'Renamed' WHERE slug = 'test-a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: merchant cannot update own store_name'; END IF;

  -- denied: billing column
  BEGIN
    UPDATE public.tenants SET billing_state = 'active' WHERE slug = 'test-a';
    RAISE EXCEPTION 'FAIL: merchant could update billing_state';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- denied: plan
  BEGIN
    UPDATE public.tenants SET plan = 'pro' WHERE slug = 'test-a';
    RAISE EXCEPTION 'FAIL: merchant could update plan';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- denied: link self to another tenant
  BEGIN
    INSERT INTO public.tenant_users (tenant_id, auth_user_id, role)
    VALUES ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1', 'owner');
    RAISE EXCEPTION 'FAIL: merchant could link self to another tenant';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- denied: read subscriptions
  BEGIN
    PERFORM card_token FROM public.subscriptions;
    RAISE EXCEPTION 'FAIL: merchant could read subscriptions';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- allowed: read own tenant link
  SELECT count(*) INTO n FROM public.tenant_users;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: expected exactly own tenant_users row, got %', n; END IF;
END $$;

ROLLBACK;
