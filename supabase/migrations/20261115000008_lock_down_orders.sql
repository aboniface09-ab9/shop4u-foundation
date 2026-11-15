-- Phase 6 (found by the production pre-flight, 15 Nov 2026): the LIVE orders table is more open than the repo's SQL.
--
--  1. orders_update_v1  [UPDATE to public, USING true]: ANYONE, signed in or not, could change ANY order
--     (mark it paid, change the total, the email or the delivery address). The only code that used it was the
--     mock gateway, which now returns 404 in production builds. Merchants keep updating their own orders
--     through orders_isolation; the PayFast webhook uses the service role.
--  2. orders_insert_storefront [INSERT to public, WITH CHECK true]: anyone could INSERT an order that is already
--     'paid' or 'fulfilled'. Checkout only ever inserts a fresh 'pending' order, so require exactly that.
--     (Order TOTALS are still set by the customer's browser: that is finding H3, which needs server-side pricing.)
--  3. get_order_by_reference() returned the WHOLE order row (name, email, phone, delivery address) to anyone
--     who knew the reference, and references were a base-36 timestamp, so they could be enumerated. It now
--     returns the row with personal details removed and the email masked (j***@example.com). The order
--     status page only needs status, items and totals. New references are random (see src/lib/order-ref.ts).

DROP POLICY IF EXISTS orders_update_v1 ON public.orders;

DROP POLICY IF EXISTS orders_insert_storefront ON public.orders;
CREATE POLICY orders_insert_storefront ON public.orders
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND paid_at IS NULL
    AND fulfilled_at IS NULL
    AND payment_reference IS NULL
    AND tracking_number IS NULL
  );

-- Customers never update or delete orders. (Defence in depth: even a future policy mistake cannot expose these.)
REVOKE UPDATE, DELETE, TRUNCATE ON public.orders FROM anon;

-- Same signature and return type as before, so the app keeps working; jsonb_populate_record builds the row by
-- column NAME, so it does not depend on column order.
CREATE OR REPLACE FUNCTION public.get_order_by_reference(p_ref text)
RETURNS SETOF public.orders
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (jsonb_populate_record(
            NULL::public.orders,
            to_jsonb(o) || jsonb_build_object(
              'customer_name', '',
              'customer_phone', NULL,
              'shipping_address', '{}'::jsonb,
              'customer_email', regexp_replace(o.customer_email, '^(.).*(@.*)$', '\1***\2')
            )
          )).*
    FROM public.orders o
   WHERE o.order_number = p_ref
   LIMIT 1;
$$;
