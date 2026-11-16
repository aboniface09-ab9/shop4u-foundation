-- Quote discount: a percentage off the ONCE-OFF build, with an optional label (e.g. "Referral discount").
--
-- Rules (kept deliberately simple):
--   * It applies to the once-off total only, never to the monthly fee.
--   * The deposit percentage and the balance are worked out on the DISCOUNTED once-off total.
--   * VAT (if the business ever registers) is charged on the discounted amounts.
--   * It is editable only while a quote is a draft; once sent, the quote (and so the discount) is locked.
--   * The acceptance fingerprint (accepted_content_hash) now covers the discount, so what the client accepted
--     provably includes it. Quotes accepted before this migration keep the hash they already have.
--   * Existing quotes default to 0% and behave exactly as before.
--
-- Re-defines four functions from migrations 0004 and 0005 with ONLY the discount added.

ALTER TABLE public.quotes
  ADD COLUMN discount_percent integer NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  ADD COLUMN discount_label   text    NOT NULL DEFAULT '' CHECK (char_length(discount_label) <= 100);

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
    'discount_percent', q.discount_percent, 'discount_label', q.discount_label,
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

  SELECT q.number || '|' || q.deposit_percent || '|' || q.vat_rate_bps || '|' || q.discount_percent || '|' || q.discount_label || '|' || q.intro || '|' || q.terms || '|' ||
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
  once := once - public._pct_cents(once, q.discount_percent * 100);  -- discount applies before the deposit split
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
  VALUES (inv_id, 'Balance of website build on launch', 'Quotation ' || q.number || ': remaining ' || (100 - q.deposit_percent) || '% of the once-off build'
          || CASE WHEN q.discount_percent > 0 THEN ' (after the ' || q.discount_percent || '% ' || COALESCE(NULLIF(q.discount_label, ''), 'discount') || ')' ELSE '' END
          || '.', 1, bal);
  INSERT INTO public.activity_log (entity_type, entity_id, event, detail, actor)
  VALUES ('invoice', inv_id, 'invoice_created', jsonb_build_object('kind', 'balance'), NULL);
  RETURN true;
END $$;

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
  once := once - public._pct_cents(once, q.discount_percent * 100);  -- discount applies to the once-off build only

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
      VALUES (inv_id, 'Deposit (' || q.deposit_percent || '% of once-off build)',
              'Quotation ' || q.number
              || CASE WHEN q.discount_percent > 0 THEN ', after the ' || q.discount_percent || '% ' || COALESCE(NULLIF(q.discount_label, ''), 'discount') ELSE '' END,
              1, dep);
      INSERT INTO public.activity_log (entity_type, entity_id, event, detail, actor)
      VALUES ('invoice', inv_id, 'invoice_created', jsonb_build_object('kind', 'deposit'), NULL);
    END IF;
  END IF;

  IF q.project_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.projects WHERE id = q.project_id AND stage = 'live') THEN
    PERFORM public._activate_project_billing(q.project_id);
  END IF;
END $$;

-- Same access as before (CREATE OR REPLACE keeps grants; restated for clarity).
REVOKE ALL ON FUNCTION public.get_quote_by_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_quote(text, text)  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_quote_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_quote(text, text)  TO anon, authenticated;
REVOKE ALL ON FUNCTION public._create_balance_invoice(uuid), public._create_acceptance_invoices(uuid) FROM PUBLIC, anon, authenticated;
