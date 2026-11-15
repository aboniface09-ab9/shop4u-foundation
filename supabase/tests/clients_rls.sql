-- Run on the DEV database after 20261115000002_clients_projects.sql.
-- Fictional users only. Ends with an exception so everything rolls back;
-- the final message must read 'ALL CHECKS PASSED' (when run via a tool that
-- wraps in a transaction). Via psql, remove the last RAISE and keep ROLLBACK.
BEGIN;

INSERT INTO auth.users (id, aud, role, email) VALUES
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'admin@example.com'),
  ('00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'merchant@example.com');
INSERT INTO public.platform_admins (auth_user_id) VALUES ('00000000-0000-0000-0000-0000000000c1');

-- admin can CRUD
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
DO $$
DECLARE cid uuid; pid uuid; n int;
BEGIN
  INSERT INTO public.clients (company_name) VALUES ('Example Seafood Co') RETURNING id INTO cid;
  INSERT INTO public.client_contacts (client_id, name, email, is_primary) VALUES (cid, 'Pat Example', 'pat@example.com', true);
  BEGIN
    INSERT INTO public.client_contacts (client_id, name, is_primary) VALUES (cid, 'Second Primary', true);
    RAISE EXCEPTION 'FAIL: two primary contacts allowed';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  INSERT INTO public.projects (client_id, name) VALUES (cid, 'Example site') RETURNING id INTO pid;
  BEGIN
    UPDATE public.projects SET repo_url = 'javascript:alert(1)' WHERE id = pid;
    RAISE EXCEPTION 'FAIL: non-https repo_url accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO public.content_items (project_id, item) VALUES (pid, 'Logo files');
  INSERT INTO public.activity_log (entity_type, entity_id, event, actor) VALUES ('project', pid, 'stage_changed', auth.uid());
  BEGIN
    UPDATE public.activity_log SET event = 'tampered';
    RAISE EXCEPTION 'FAIL: admin could edit audit log';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- non-admin sees nothing and cannot write
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.clients;          IF n <> 0 THEN RAISE EXCEPTION 'FAIL: non-admin read clients'; END IF;
  SELECT count(*) INTO n FROM public.client_contacts;  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: non-admin read contacts'; END IF;
  SELECT count(*) INTO n FROM public.projects;         IF n <> 0 THEN RAISE EXCEPTION 'FAIL: non-admin read projects'; END IF;
  SELECT count(*) INTO n FROM public.content_items;    IF n <> 0 THEN RAISE EXCEPTION 'FAIL: non-admin read content'; END IF;
  SELECT count(*) INTO n FROM public.activity_log;     IF n <> 0 THEN RAISE EXCEPTION 'FAIL: non-admin read log'; END IF;
  BEGIN
    INSERT INTO public.clients (company_name) VALUES ('Sneaky');
    RAISE EXCEPTION 'FAIL: non-admin inserted client';
  EXCEPTION WHEN insufficient_privilege OR others THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
  END;
END $$;

-- anon has no access at all
RESET request.jwt.claims;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.clients;
    RAISE EXCEPTION 'FAIL: anon could query clients';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE EXCEPTION 'ALL CHECKS PASSED';
END $$;

ROLLBACK;
