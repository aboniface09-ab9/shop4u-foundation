-- Phase 4: send, view and accept quotes via a private token link.
--
-- Design: the token is 256 random bits (64 hex chars). Only its SHA-256 hash is stored.
-- The client's browser/Worker calls SECURITY DEFINER functions with the token; no table is
-- readable by anon, and no service-role key is needed on the public path.
--   send_quote(...)          admin only. Locks the quote, issues a token, returns it ONCE.
--   get_quote_by_token(...)  anon. Returns that one quote's document, marks it viewed.
--   accept_quote(...)        anon. Records name + server timestamp + content hash. Idempotent.

ALTER TABLE public.quotes
  ADD COLUMN token_hash            text UNIQUE,
  ADD COLUMN sent_at               timestamptz,
  ADD COLUMN sent_to_email         text,
  ADD COLUMN viewed_at             timestamptz,
  ADD COLUMN accepted_at           timestamptz,
  ADD COLUMN accepted_name         text CHECK (char_length(accepted_name) BETWEEN 2 AND 120),
  ADD COLUMN accepted_content_hash text;

-- Re-issue helper shared by first send and resend.
CREATE OR REPLACE FUNCTION public.send_quote(p_quote_id uuid, p_to_email text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  q public.quotes%ROWTYPE;
  token text;
  line_count int;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF p_to_email IS NULL OR p_to_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' OR char_length(p_to_email) > 254 THEN
    RAISE EXCEPTION 'valid recipient email required';
  END IF;

  SELECT * INTO q FROM public.quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quote not found'; END IF;
  IF q.status NOT IN ('draft', 'sent', 'viewed') THEN
    RAISE EXCEPTION 'quote is % and cannot be sent', q.status;
  END IF;
  IF q.valid_until < (now() AT TIME ZONE 'Africa/Johannesburg')::date THEN
    RAISE EXCEPTION 'quote validity date has passed';
  END IF;
  SELECT count(*) INTO line_count FROM public.quote_lines WHERE quote_id = q.id;
  IF line_count = 0 THEN RAISE EXCEPTION 'quote has no line items'; END IF;

  token := encode(gen_random_bytes(32), 'hex');

  UPDATE public.quotes
     SET token_hash = encode(digest(token, 'sha256'), 'hex'),
         status = CASE WHEN q.status = 'draft' THEN 'sent' ELSE q.status END,
         sent_at = now(),
         sent_to_email = p_to_email
   WHERE id = q.id;

  INSERT INTO public.activity_log (entity_type, entity_id, event, detail, actor)
  VALUES ('quote', q.id, CASE WHEN q.status = 'draft' THEN 'quote_sent' ELSE 'quote_resent' END,
          jsonb_build_object('to', p_to_email), auth.uid());

  RETURN token;
END $$;

-- The public document: only what the client should see. No ids, no bank details.
CREATE OR REPLACE FUNCTION public.get_quote_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  q public.quotes%ROWTYPE;
  c public.clients%ROWTYPE;
  b public.business_settings%ROWTYPE;
  lines jsonb;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;

  SELECT * INTO q FROM public.quotes WHERE token_hash = encode(digest(p_token, 'sha256'), 'hex') FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF q.status IN ('sent', 'viewed') AND q.valid_until < (now() AT TIME ZONE 'Africa/Johannesburg')::date THEN
    UPDATE public.quotes SET status = 'expired' WHERE id = q.id;
    q.status := 'expired';
  END IF;

  IF q.status = 'sent' THEN
    UPDATE public.quotes SET status = 'viewed', viewed_at = now() WHERE id = q.id;
    INSERT INTO public.activity_log (entity_type, entity_id, event, actor) VALUES ('quote', q.id, 'quote_viewed', NULL);
    q.status := 'viewed';
  END IF;

  SELECT * INTO c FROM public.clients WHERE id = q.client_id;
  SELECT * INTO b FROM public.business_settings WHERE id = 1;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'kind', kind, 'name', name, 'description', description,
           'quantity', quantity, 'unit_price_cents', unit_price_cents
         ) ORDER BY kind DESC, sort_order, id), '[]'::jsonb)
    INTO lines FROM public.quote_lines WHERE quote_id = q.id;

  RETURN jsonb_build_object(
    'number', q.number, 'status', q.status, 'valid_until', q.valid_until,
    'deposit_percent', q.deposit_percent, 'vat_rate_bps', q.vat_rate_bps,
    'intro', q.intro, 'terms', q.terms,
    'accepted_name', q.accepted_name, 'accepted_at', q.accepted_at,
    'client', jsonb_build_object('company_name', c.company_name, 'billing_address', c.billing_address),
    'business', jsonb_build_object(
      'legal_name', b.legal_name, 'registration_number', b.registration_number,
      'vat_registered', b.vat_registered, 'vat_number', b.vat_number,
      'address', b.address, 'email', b.email, 'phone', b.phone),
    'lines', lines
  );
END $$;

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

  -- Idempotent: a second click or a retry returns the original acceptance untouched.
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

  -- Hash of exactly what was accepted: number, terms, deposit, VAT and every line.
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

  RETURN jsonb_build_object('ok', true, 'already', false, 'accepted_at', now(), 'accepted_name', clean_name);
END $$;

REVOKE ALL ON FUNCTION public.send_quote(uuid, text)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_quote_by_token(text)      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_quote(text, text)      FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_quote(uuid, text)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_quote_by_token(text)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_quote(text, text)   TO anon, authenticated;
